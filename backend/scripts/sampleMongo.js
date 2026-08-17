import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/crimelens";

const client = new MongoClient(uri);
await client.connect();
const db = client.db();

const nonempty = await db
  .collection("india_crimes")
  .find({ Region: { $ne: "" } })
  .project({ Region: 1, Crime_Type: 1, Month: 1, Day_of_Week: 1, "Day_of_Week ": 1 })
  .limit(1)
  .next();

const empty = await db
  .collection("india_crimes")
  .find({ Region: "" })
  .project({ Region: 1, Crime_Type: 1, Month: 1 })
  .limit(1)
  .next();

console.log({ nonempty, empty });
await client.close();

