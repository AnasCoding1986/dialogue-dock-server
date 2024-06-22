const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zdajqzn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("DialogueDock").collection("users");
    const allMsgCollection = client.db("DialogueDock").collection("allMsg");
    const notificationCollection = client.db("DialogueDock").collection("notification");
    const commentsCollection = client.db("DialogueDock").collection("comments");

    // JWT related
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

    // Middleware to verify token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Middleware to verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    // Users routes
    app.get('/users', verifyToken, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const user = await userCollection.findOne({ email });
      res.send({ admin: user?.role === 'admin' });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const existingUser = await userCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.updateOne({ email }, { $set: { membership: 'member' } });
      res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await userCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role: 'admin' } });
      res.send(result);
    });

    // allMsg routes
    app.get('/allMsg', async (req, res) => {
      const allMessages = await allMsgCollection.find().sort({ postTime: -1 }).toArray();
      res.send(allMessages);
    });

    app.get('/allMsg/:id', async (req, res) => {
      const id = req.params.id;
      const message = await allMsgCollection.findOne({ _id: new ObjectId(id) });
      res.send(message);
    });

    // Add this new route for message count by email
    app.get('/allMsg/count/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const count = await allMsgCollection.countDocuments({ email });
      res.send({ count });
    });

    app.post('/allMsg', verifyToken, async (req, res) => {
      const msg = req.body;
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      const messageCount = await allMsgCollection.countDocuments({ email });

      if (user?.membership !== 'member' && messageCount >= 5) {
        return res.status(403).send({ message: 'You have reached the maximum number of posts allowed.' });
      }

      msg.postTime = new Date().toISOString();
      const result = await allMsgCollection.insertOne(msg);
      res.send(result);
    });

    app.patch('/allMsg/upvote/:id', async (req, res) => {
      const id = req.params.id;
      const result = await allMsgCollection.updateOne({ _id: new ObjectId(id) }, { $inc: { upvote: 1 } });
      res.send(result);
    });

    app.patch('/allMsg/downvote/:id', async (req, res) => {
      const id = req.params.id;
      const result = await allMsgCollection.updateOne({ _id: new ObjectId(id) }, { $inc: { downvote: 1 } });
      res.send(result);
    });

    app.patch('/allMsg/commentsCount/:id', async (req, res) => {
      const id = req.params.id;
      const result = await allMsgCollection.updateOne({ _id: new ObjectId(id) }, { $inc: { commentsCount: 1 } });
      res.send(result);
    });

    app.delete('/allMsg/:id', async (req, res) => {
      const id = req.params.id;
      const result = await allMsgCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Comments routes

    app.get('/comments', async (req, res) => {
      const allComments = await commentsCollection.find().toArray();
      res.send(allComments);
    });

    app.post('/comments', async (req, res) => {
      const comment = req.body;
      const result = await commentsCollection.insertOne(comment);
      res.send(result);
    });

    // Notification routes
    app.get('/notification', async (req, res) => {
      const notifications = await notificationCollection.find().toArray();
      res.send(notifications);
    });

    app.post('/notification', async (req, res) => {
      const notification = req.body;
      const result = await notificationCollection.insertOne(notification);
      res.send(result);
    });

    // Payment intent route
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('DialogueDock is running');
});

app.listen(port, () => {
  console.log(`DialogueDock is sitting on port ${port}`);
});
