/** Own exactly one domain handle; release it on setup failure and every shutdown path. */
export async function withOwnedDomain(ctx, specification, setup) {
  return withOwnedDomains(ctx,[specification],async([store])=>setup(store));
}

/** Keep legacy and history handles under one lifetime; stop callers before closing either. */
export async function withOwnedDomains(ctx, specifications, setup) {
  const stores=[];
  let released=false;
  const close=async()=>{
    if(released)return;
    released=true;
    const failures=[];
    for(const store of [...stores].reverse())try{await store.close();}catch(error){failures.push(error);}
    if(failures.length)throw new AggregateError(failures,'Failed to release owned domains');
  };
  try {
    for(const specification of specifications)stores.push(await ctx.storageDomain.open(specification));
    const stop=await setup(stores);
    ctx.effect(()=>async()=>{if(released)return;try{await stop?.();}finally{await close();}});
  } catch(error) {try{await close();}catch{}throw error;}
}
