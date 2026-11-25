import { openStore } from "./store.mjs";

let store;
export function hostedDemoStore() {
  return (store ??= openStore({ directory: "memory://", seed: true }));
}
