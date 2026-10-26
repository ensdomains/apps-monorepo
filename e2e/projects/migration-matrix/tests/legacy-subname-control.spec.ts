import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { namehash, parseAbi, zeroAddress } from 'viem'
import { test, expect, localSepolia } from '../matrix-fixture.js'
import { account, accountKey, seedConfiguration, migrateLockedAncestor, type Configuration } from '../seed.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { V1_ENS_REGISTRY, V1_NAME_WRAPPER } from '../../../fixtures/makeV1Name.js'
import { PERMITTED_SIGN_KINDS } from '../../../helpers/manager-auth.js'
import { connectWithHeadlessWallet } from '../../../helpers/portal-auth.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { sourceRecords, chainActivity } from '../record-evidence.js'
import { beforePermissions, v2State } from '../probes.js'
import { routeToLocalFork, closeFixtureContext } from '../local-fork-routing.js'
import { installInventory } from '../ui-actions.js'
import { queryFailures } from '../diagnostics.js'

const configurations: Configuration[] = JSON.parse(readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'))
const ids = process.env.MATRIX_IDS?.split(',') ?? ['CFG-0011','CFG-0243','CFG-0251','CFG-0859','CFG-0867','CFG-0883','CFG-0923']
const registryAbi = parseAbi(['function owner(bytes32 node) view returns(address)','function resolver(bytes32 node) view returns(address)'])
for(const c of configurations.filter(c=>ids.includes(c.config_id))){
  if(c.level==='2LD')throw new Error(`${c.config_id}: legacy deletion fixture requires a subname`)
  const holder=c.name_holder.startsWith('W')?c.name_holder:c.name_manager
  const parentHolder=c.level==='3LD'?c.root_manager:c.parent_controller
  for(const actor of process.env.MATRIX_ALL_ACTORS === '1' ? c.actors.filter(a=>a.actor!=='Disconnected').map(a=>a.actor) : [...new Set([holder,parentHolder,c.root_owner,'Unrelated'])]){
    test(`legacy subname control ${c.config_id} ${actor}`,async({browser},info)=>{
      info.setTimeout(360000)
      const out=resolve(process.env.REPLACEMENT_RESULTS!,'supplemental');mkdirSync(out,{recursive:true})
      const evidence:Record<string,any>={id:`LEGACY-CONTROL-${c.config_id}-${actor}`,configurations:[c.config_id],configuration:c,actor,appChecks:[],checks:{},phase:'fixture',startedAt:new Date().toISOString(),discovery:'Fresh V1 fixtures; seeded index inventory, actual app permissions and submitted transactions. No migration is attempted in this before-stage control test.'}
      const stage = process.env.MATRIX_AFTER_REFUSAL === '1' ? 'after' : 'before'
      evidence.stage=stage
      if(stage==='after'){evidence.id=`REFUSAL-CONTROL-${c.config_id}-${actor}`;evidence.discovery='Fresh independent fixture, actual Manager refusal and unchanged tree/authorities, then the Explorer action. Earlier before-stage evidence remains a separate test.'}
      const save=()=>writeFileSync(resolve(out,`legacy-control-${c.config_id}-${actor}.json`),JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?String(v):v,2))
      const f=await seedConfiguration(c),parent=f.leaf.split('.').slice(1).join('.')
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage()
      const state=async()=>({owner:await publicClient.readContract({address:V1_ENS_REGISTRY,abi:registryAbi,functionName:'owner',args:[namehash(f.leaf)]}),resolver:await publicClient.readContract({address:V1_ENS_REGISTRY,abi:registryAbi,functionName:'resolver',args:[namehash(f.leaf)]})})
      try{
        if(f.native&&c.parent_migrated==='Yes'){
          evidence.ancestorSetup=[await migrateLockedAncestor(f.root,account(c.root_owner))]
          if(c.level==='4LD')evidence.ancestorSetup.push(await migrateLockedAncestor(`child.${f.root}`,account(c.parent_controller)))
        }
        await f.advance()
        evidence.names=f.names;evidence.historySeed=f.historySeed
        evidence.beforeBlock=await publicClient.getBlockNumber({cacheTime:0});evidence.beforeRoot=await v2State(f.root)
        evidence.subject=f.leaf;evidence.beforeState=await state();evidence.beforeRecords=await resolveRecords(f.leaf,f.records)
        evidence.parentRecordsBefore=await resolveRecords(parent,f.recordsFor(parent))
        evidence.sourceRecordsBefore=await sourceRecords(f.leaf,f.records)
        evidence.beforeActivity=await chainActivity(f.startBlock)
        if(stage==='after'){evidence.phase='actual migration refusal';evidence.refusalCheckpoint=await refusalCheckpoint(browser,f);save()}
        evidence.beforePermission=await beforePermissions(f,actor)
        const p=evidence.beforePermission
        expect(p.deleteAsHolder?.result).not.toBe('BLOCKED');expect(p.deleteAsParent?.result).not.toBe('BLOCKED')
        const asHolder=p.deleteAsHolder?.result==='ALLOWED'
        const asParent=p.deleteAsParent?.result==='ALLOWED'&&!(f.wrappedFor(f.leaf)&&!f.wrappedFor(parent))
        const allowed=asHolder||asParent
        evidence.expected={allowed,asHolder,asParent,wrapperMismatchParentGuard:f.wrappedFor(f.leaf)&&!f.wrappedFor(parent)}
        await routeToLocalFork(page);await page.clock.install({time:new Date(Number((await publicClient.getBlock()).timestamp)*1000)});await installInventory(page,f,'before')
        const wallet=await injectHeadlessWeb3Provider({page,privateKeys:[accountKey(actor)],chains:[localSepolia],permitted:[...PERMITTED_SIGN_KINDS]})
        await page.goto(process.env.PORTAL_APP_URL!);await connectWithHeadlessWallet(page,wallet)
        await page.goto(`${process.env.PORTAL_APP_URL}/${parent}/subnames`)
        const row=page.getByRole('row').filter({has:page.getByText(f.leaf,{exact:true})});await expect(row).toBeVisible({timeout:60000})
        evidence.phase='Explorer V1 permission readiness'
        await expect.poll(()=>page.evaluate(async()=>{
          const portalModule='/src/utils/queryClient.ts'
          const queries=(await import(portalModule)).queryClient.getQueryCache().getAll()
          const matching=queries.filter((q:any)=>q.isActive()&&JSON.stringify(q.queryKey).includes('transfer-v1-name-state'))
          return matching.length>0&&matching.every((q:any)=>q.state.status==='success')
        }),{timeout:60000}).toBe(true)
        evidence.phase='Explorer V1 deletion'
        const remove=row.getByRole('button',{name:`Delete ${f.leaf}`,exact:true})
        if(allowed){
          await expect(remove).toBeEnabled({timeout:30000});await remove.click();await page.getByRole('button',{name:'Confirm',exact:true}).click();await driveTransactionsToSuccess(page,wallet,[],90000)
          expect((await state()).owner).toBe(zeroAddress);expect((await state()).resolver).toBe(zeroAddress)
          if(f.wrappedFor(f.leaf))expect(await publicClient.readContract({address:V1_NAME_WRAPPER,abi:parseAbi(['function balanceOf(address owner,uint256 id) view returns(uint256)']),functionName:'balanceOf',args:[account(holder).address,BigInt(namehash(f.leaf))]})).toBe(0n)
          expect(await resolveRecords(parent,f.recordsFor(parent))).toEqual(evidence.parentRecordsBefore)
          expect(await sourceRecords(f.leaf,f.records)).toEqual(evidence.sourceRecordsBefore)
        }else{
          if(await remove.count())await expect(remove).toBeDisabled();else await expect(remove).toHaveCount(0)
          expect(await state()).toEqual(evidence.beforeState);expect(await resolveRecords(f.leaf,f.records)).toEqual(evidence.beforeRecords)
        }
        evidence.checks['V1 deletion authority and outcome']={result:'PASS',expected:allowed?'allowed':'denied'}
        evidence.appChecks.push({app:'Explorer',actor,stage,action:'delete subname',result:'PASS',detail:allowed?'Actual V1 delete completed; parent records and original stored child records preserved.':'Delete unavailable/disabled after V1 state loaded; subject state and resolution unchanged.'})
        evidence.phase='completed independent legacy deletion check'
      }catch(error){evidence.error=String(error);evidence.appChecks.push({app:'Explorer',actor,stage,action:'delete subname',result:evidence.phase==='Explorer V1 deletion'?'FAIL':'BLOCKED',detail:String(error)});throw error}
      finally{evidence.screen=await page.locator('body').innerText().catch(()=>'');evidence.queryFailures=await queryFailures(page);await page.screenshot({path:resolve(out,`legacy-control-${c.config_id}-${actor}.png`),fullPage:true}).catch(()=>{});evidence.finalState=await state();evidence.afterState=await v2State(f.leaf);evidence.afterRoot=await v2State(f.root);evidence.afterTreeStates=await Promise.all(f.names.map(async name=>({name,state:await v2State(name)})));evidence.afterRecords=await resolveRecords(f.leaf,f.records);evidence.afterActivity=await chainActivity(f.startBlock);evidence.activity=evidence.afterActivity;evidence.completedAt=new Date().toISOString();evidence.assertionErrors=info.errors.map(e=>e.message);save();await closeFixtureContext(context)}
    })
  }
}

import { refusalCheckpoint } from '../refusal-checkpoint.js'
