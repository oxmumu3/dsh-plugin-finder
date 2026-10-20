/** Own exactly one domain handle; release it on setup failure and every shutdown path. */
export async function withOwnedDomain(ctx, specification, setup) {
  const store=await ctx.storageDomain.open(specification);
  let released=false;
  const close=async()=>{if(released)return;released=true;await store.close();};
  try {
    const stop=await setup(store);
    ctx.effect(()=>async()=>{if(released)return;try{await stop?.();}finally{await close();}});
  } catch(error) {await close();throw error;}
}
