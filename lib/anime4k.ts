/// <reference types="@webgpu/types" />
// The package exposes its CNN pipelines. Own the render loop to release GPU resources.
export async function createUpscaler(video:HTMLVideoElement,canvas:HTMLCanvasElement,quality:'balanced'|'quality',onFailure:(message:string)=>void,onFrame:()=>void){
 if(!navigator.gpu)throw new Error('当前浏览器没有 WebGPU，无法开启 Anime4K');
 if(!video.videoWidth||video.readyState<2)throw new Error('请先加载并播放视频，再开启超分');
 if(video.videoWidth>1920||video.videoHeight>1080)throw new Error('当前 Web 超分支持最高 1080p 输入');
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('当前设备无法提供 WebGPU');
 const device=await adapter.requestDevice();let stopped=false,frame=0;
 try{
  const module=await import('anime4k-webgpu');const library=(module as any).default||module;
  const width=video.videoWidth,height=video.videoHeight;canvas.width=width*2;canvas.height=height*2;
  const context=canvas.getContext('webgpu');if(!context)throw new Error('WebGPU 画布创建失败');
  const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device,format,alphaMode:'opaque'});
  const input=device.createTexture({size:[width,height],format:'rgba16float',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  const enhance=new (quality==='quality'?library.CNNx2VL:library.CNNx2M)({device,inputTexture:input});
  const shader=device.createShaderModule({code:`
   @group(0) @binding(0) var image: texture_2d<f32>;
   @group(0) @binding(1) var smp: sampler;
   struct Out { @builtin(position) pos:vec4f, @location(0) uv:vec2f }
   @vertex fn vertex(@builtin(vertex_index) id:u32)->Out {
    var p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var out:Out;out.pos=vec4f(p[id],0,1);out.uv=vec2f((p[id].x+1)/2,(1-p[id].y)/2);return out;
   }
   @fragment fn fragment(v:Out)->@location(0) vec4f {return textureSample(image,smp,v.uv);}
  `});
  const pipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'vertex'},fragment:{module:shader,entryPoint:'fragment',targets:[{format}]},primitive:{topology:'triangle-list'}});
  const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:enhance.getOutputTexture().createView()},{binding:1,resource:device.createSampler({magFilter:'linear',minFilter:'linear'})}]});
  const stop=()=>{if(stopped)return;stopped=true;video.cancelVideoFrameCallback(frame);context.unconfigure();device.destroy();};
  const fail=(message:string)=>{stop();onFailure(message);};
  device.addEventListener('uncapturederror',()=>fail('显卡处理失败，已恢复原始画面'));
  void device.lost.then(()=>{if(!stopped)fail('显卡连接已断开，已恢复原始画面');});
  const draw=()=>{if(stopped)return;try{
   if(video.videoWidth!==width||video.videoHeight!==height){fail('清晰度发生变化，请重新开启超分');return;}
   device.queue.copyExternalImageToTexture({source:video},{texture:input},[width,height]);const encoder=device.createCommandEncoder();enhance.pass(encoder);
   const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);onFrame();frame=video.requestVideoFrameCallback(draw);
  }catch{fail('此视频未允许跨域 GPU 处理，已恢复原始画面');}};
  draw();return stop;
 }catch(error){device.destroy();throw error;}
}
