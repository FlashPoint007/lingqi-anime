import handler from "vinext/server/fetch-handler";
import {guardRequest,readRequestText,RequestLimitError,secureResponse} from "../lib/request-guard";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const secret=(env as Cloudflare.Env & {LINGQI_MEDIA_SECRET?:string}).LINGQI_MEDIA_SECRET||process.env.LINGQI_MEDIA_SECRET;
    const protection=await guardRequest(request,env.DB,secret,undefined,true);if(protection.response)return secureResponse(protection.response);
    let release=protection.release;
    try{
      if(request.method==='POST'&&new URL(request.url).pathname==='/api/source'){
        const raw=await readRequestText(request);let data;try{data=JSON.parse(raw);}catch{throw new RequestLimitError('JSON 格式不正确',400);}
        if(data?.operation==='resolve'){
          const extra=await guardRequest(request,env.DB,secret,'resolve',true);if(extra.response){release();return secureResponse(extra.response);}const first=release;release=()=>{first();extra.release();};
        }
        request=new Request(request,{body:raw});
      }
    }catch(error){release();return secureResponse(Response.json({error:error instanceof RequestLimitError?error.message:'请求读取失败'},{status:error instanceof RequestLimitError?error.status:400}));}
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    try{return secureResponse(await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)),release);}catch{release();return secureResponse(Response.json({error:"服务暂时不可用，请稍后重试"},{status:503}));}
  },
};
