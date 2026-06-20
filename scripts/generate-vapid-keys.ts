import { createECDH } from "node:crypto";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

console.log(
  JSON.stringify(
    {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
      VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString("base64url"),
      VAPID_SUBJECT: "mailto:franappignanesi@gmail.com"
    },
    null,
    2
  )
);
