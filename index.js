const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// midddlewire
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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db("DialogueDock").collection("users");
    const allMsgCollection = client.db("DialogueDock").collection("allMsg");
    const notificationCollection = client.db("DialogueDock").collection("notification");
    const commentsCollection = client.db("DialogueDock").collection("comments");

    // jwt related
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      });
      res.send({ token })
    })

    // middlewire
    const verifyToken = (req, res, next) => {
      console.log('inside verify token', req.headers);
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
      })
    }

    // use verifyAdmin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }


    // users
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      };

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    app.post('/users', async (req, res) => {
      const user = req.body;

      // insert email if users does not exists
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      };

      const result = await userCollection.insertOne(user);
      res.send(result)
    })

    app.patch('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email }; // Update this line
      const updateDoc = {
        $set: {
          membership: 'member'
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // allMsg
    app.get('/allMsg', async (req, res) => {
      const allMessages = await allMsgCollection.find().sort({ postTime: -1 }).toArray();
      res.send(allMessages);
  });
  

    app.get('/allMsg/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await allMsgCollection.findOne(query);
      res.send(result)
    })

    app.post('/allMsg', async (req, res) => {
      const msg = req.body;
      msg.postTime = new Date().toISOString(); // Add timestamp in ISO format
      const result = await allMsgCollection.insertOne(msg);
      res.send(result);
  });  

    app.patch('/allMsg/upvote/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $inc: { upvote: 1 } };
      const result = await allMsgCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/allMsg/downvote/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $inc: { downvote: 1 } };
      const result = await allMsgCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch('/allMsg/commentsCount/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $inc: { commentsCount: 1 } };
      const result = await allMsgCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


    // comments

    app.post('/comments', async (req, res) => {
      const comment = req.body;
      const result = await commentsCollection.insertOne(comment);
      res.send(result);
    })


    // notification
    app.get('/notification', async (req, res) => {
      const result = await notificationCollection.find().toArray();
      res.send(result);
    })

    app.post('/notification', async (req, res) => {
      const singleNotification = req.body;
      const result = await notificationCollection.insertOne(singleNotification);
      res.send(result);
    })

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      const amount = parseInt(price * 100);
      console.log(amount, "amount inside the");

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('DialogueDock is running')
})

app.listen(port, () => {
  console.log(`DialogueDock is sitting on port ${port}`);
})