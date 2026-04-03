import { defineEmail } from 'kumoh/email';

export default defineEmail(async (message, env, ctx) => {
  console.log(message, env, ctx);
});
