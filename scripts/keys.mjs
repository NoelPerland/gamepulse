import { credentials } from "../server/credentials.mjs";
const keys = await credentials();
console.log(
  "Private local development credentials. Keep out of source control.\nIngestion: " +
    keys.write +
    "\nOperator: " +
    keys.admin,
);
