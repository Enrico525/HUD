// Edge Function da Vercel: recebe /api/* e /auth/* (ver vercel.json) e usa o mesmo Worker da Cloudflare.
import { tratar } from "../vercel/adaptador";

export const config = { runtime: "edge" };

export default tratar;
