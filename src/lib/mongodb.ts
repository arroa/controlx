import "server-only";

import { Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB_NAME ?? "controlx";

declare global {
  var controlXMongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | undefined;

function createClientPromise() {
  if (!uri) {
    throw new Error(
      "MONGODB_URI no está configurada. Agrégala al entorno antes de consultar datos.",
    );
  }

  return new MongoClient(uri).connect();
}

export function getMongoClient(): Promise<MongoClient> {
  if (process.env.NODE_ENV === "development") {
    global.controlXMongoClientPromise ??= createClientPromise();
    return global.controlXMongoClientPromise;
  }

  clientPromise ??= createClientPromise();
  return clientPromise;
}

export async function getDatabase(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(databaseName);
}

export function isMongoConfigured(): boolean {
  return Boolean(uri);
}
