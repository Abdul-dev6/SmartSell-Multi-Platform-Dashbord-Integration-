import { MongoMemoryServer } from "mongodb-memory-server";

// One throwaway MongoDB for the whole run; tests never touch the real database.
export default async function setup({ provide }) {
  const mongod = await MongoMemoryServer.create();
  provide("mongoUri", mongod.getUri());

  return async () => {
    await mongod.stop();
  };
}
