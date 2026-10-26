import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { injectHeadlessWeb3Provider } from '@ensdomains/headless-web3-provider'
import { encodeFunctionData, labelhash, namehash, parseAbi } from 'viem'
import { test, expect, localSepolia } from '../matrix-fixture.js'
import { account, accountKey, seedConfiguration, send, migrateLockedAncestor, type Configuration } from '../seed.js'
import { beforePermissions, v2State } from '../probes.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import { V1_ENS_REGISTRY, V1_BASE_REGISTRAR, V1_NAME_WRAPPER } from '../../../fixtures/makeV1Name.js'
import { PERMITTED_SIGN_KINDS } from '../../../helpers/manager-auth.js'
import { connectWithHeadlessWallet } from '../../../helpers/portal-auth.js'
import { driveTransactionsToSuccess } from '../../../helpers/transaction-modal.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'
import { chainActivity, sourceRecords } from '../record-evidence.js'
import { installInventory } from '../ui-actions.js'
import { routeToLocalFork, closeFixtureContext } from '../local-fork-routing.js'
import { queryFailures } from '../diagnostics.js'
import { legacyTransferAuthority, legacyTransferDenialTitle } from '../transfer-authority.js'

const configs: Configuration[] = JSON.parse(readFileSync(new URL('../configurations.json', import.meta.url), 'utf8'))
const ids = process.env.MATRIX_IDS?.split(',') ?? ['CFG-0001','CFG-0002','CFG-0003','CFG-0005','CFG-0007','CFG-0008','CFG-0009','CFG-0010','CFG-0035','CFG-0251','CFG-0860','CFG-0884']
const abi = parseAbi(['function owner(bytes32 node) view returns(address)', 'function ownerOf(uint256 id) view returns(address)', 'function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)', 'function setOwner(bytes32 node,address owner)'])
for (const c of configs.filter(c => ids.includes(c.config_id))) {
  const holder = c.level === '2LD' ? c.root_owner : c.name_holder.startsWith('W') ? c.name_holder : c.name_manager
  for (const actor of process.env.MATRIX_ALL_ACTORS === '1' ? c.actors.filter(a => a.actor !== 'Disconnected').map(a => a.actor) : [...new Set([holder, ...(c.level==='2LD' && c.root_type==='Unwrapped' ? [c.root_manager] : []), 'Unrelated'])]) {
    test(`legacy transfer ${c.config_id} ${actor}`, async ({ browser }, info) => {
      info.setTimeout(480000)
      const out=resolve(process.env.REPLACEMENT_RESULTS!,'supplemental');mkdirSync(out,{recursive:true})
      const evidence:Record<string,any>={id:`LEGACY-TRANSFER-${c.config_id}-${actor}`,configurations:[c.config_id],configuration:c,actor,checks:{},appChecks:[],startedAt:new Date().toISOString(),phase:'fixture',discovery:'Fresh V1 fixture; actual Explorer transfer/reclaim transactions or loaded refusal. Full transfer is not counted as an independent owner-only or manager-only edit.'}
      const save=()=>writeFileSync(resolve(out,`legacy-transfer-${c.config_id}-${actor}.json`),JSON.stringify(evidence,(_k,v)=>typeof v==='bigint'?String(v):v,2))
      const stage = process.env.MATRIX_AFTER_REFUSAL === '1' ? 'after' : 'before'
      evidence.stage=stage
      if(stage==='after'){evidence.id=`REFUSAL-TRANSFER-${c.config_id}-${actor}`;evidence.discovery='Fresh independent fixture, actual Manager refusal and unchanged tree/authorities, then the Explorer action. Earlier before-stage evidence remains a separate test.'}
      let context:Awaited<ReturnType<typeof browser.newContext>>|undefined
      let page:Awaited<ReturnType<typeof browser.newPage>>|undefined
      let f:Awaited<ReturnType<typeof seedConfiguration>>|undefined
      try {
        f=await seedConfiguration(c)
        if (f.native && c.parent_migrated === 'Yes') {
          evidence.ancestorSetup = [await migrateLockedAncestor(f.root, account(c.root_owner))]
          if (c.level === '4LD') evidence.ancestorSetup.push(await migrateLockedAncestor(`child.${f.root}`, account(c.parent_controller)))
        }
        await f.advance();evidence.subject=f.leaf
        evidence.names=f.names;evidence.historySeed=f.historySeed
        evidence.beforeBlock=await publicClient.getBlockNumber({cacheTime:0});evidence.beforeRoot=await v2State(f.root)
        evidence.beforeActivity=await chainActivity(f.startBlock)
        if (stage === 'after') { evidence.phase = 'actual migration refusal'; evidence.refusalCheckpoint = await refusalCheckpoint(browser, f); save() }
        const node=namehash(f.leaf)
        const registryOwner=()=>publicClient.readContract({address:V1_ENS_REGISTRY,abi,functionName:'owner',args:[node]})
        const tokenOwner=()=>f!.wrappedFor(f!.leaf)?publicClient.readContract({address:V1_NAME_WRAPPER,abi,functionName:'getData',args:[BigInt(node)]}).then(x=>x[0]):c.level==='2LD'?publicClient.readContract({address:V1_BASE_REGISTRAR,abi,functionName:'ownerOf',args:[BigInt(labelhash(f!.label))]}):registryOwner()
        evidence.beforeRecords=await resolveRecords(f.leaf,f.records)
        evidence.beforePermission=await beforePermissions(f,actor)
        const wrapperBefore=f.wrappedFor(f.leaf)?await publicClient.readContract({address:V1_NAME_WRAPPER,abi,functionName:'getData',args:[BigInt(node)]}):null
        evidence.transferAuthority=legacyTransferAuthority(evidence.beforePermission,wrapperBefore&&c.level!=='2LD'?{wrappedSubnameHolder:wrapperBefore[0]}:undefined)
        expect(evidence.transferAuthority.result).not.toBe('BLOCKED')
        const allowed=evidence.transferAuthority.result==='ALLOWED'
        const recipient=account('Unrelated').address
        const originalManager=await registryOwner()
        context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage()
        await routeToLocalFork(page);await installInventory(page,f,'before');await page.clock.install({time:new Date(Number((await publicClient.getBlock()).timestamp)*1000)})
        const wallet=await injectHeadlessWeb3Provider({page,privateKeys:[accountKey(actor)],chains:[localSepolia],permitted:[...PERMITTED_SIGN_KINDS]})
        await page.goto(process.env.PORTAL_APP_URL!);await connectWithHeadlessWallet(page,wallet)
        if(c.level==='2LD'&&c.root_type==='Unwrapped'&&c.root_owner!==c.root_manager&&actor===c.root_owner&&c.root_lifecycle==='Active'){
          evidence.phase='before reclaim manager'
          await page.goto(`${process.env.PORTAL_APP_URL}/${f.leaf}/ownership`)
          await page.getByRole('button',{name:/Reclaim manager$/}).click({timeout:60000})
          await driveTransactionsToSuccess(page,wallet,[],90000)
          expect((await registryOwner()).toLowerCase()).toBe(account(actor).address.toLowerCase())
          expect((await tokenOwner()).toLowerCase()).toBe(account(actor).address.toLowerCase())
          expect(await resolveRecords(f.leaf,f.records)).toEqual(evidence.beforeRecords)
          evidence.checks['Owner reclaims manager without transferring name or changing records']={result:'PASS'}
          evidence.appChecks.push({app:'Explorer',actor,stage,action:'reclaim manager',result:'PASS',detail:'Actual reclaim completed; registrar ownership and exact records unchanged.'})
          await send(account(actor),V1_ENS_REGISTRY,encodeFunctionData({abi,functionName:'setOwner',args:[node,originalManager]}))
          expect(await registryOwner()).toBe(originalManager)
        }
        evidence.phase='before full transfer'
        await page.goto(`${process.env.PORTAL_APP_URL}/${f.leaf}/ownership/transfer`)
        const input=page.getByPlaceholder('ENS name or address')
        if(allowed){
          expect((await tokenOwner()).toLowerCase(), 'Transfer recipient must differ from the current holder').not.toBe(recipient.toLowerCase())
          await expect(input).toBeVisible({timeout:60000});await input.fill(recipient)
          const submit=page.getByRole('button',{name:'Transfer name',exact:true});await expect(submit).toBeEnabled({timeout:120000})
          for(const label of [/Detach the resolver/,/Set the ETH address/,/Revoke everyone/]){
            const toggle=page.getByRole('switch',{name:label});if(await toggle.isVisible()&&await toggle.isEnabled()&&await toggle.isChecked())await toggle.uncheck()
          }
          await submit.click();await driveTransactionsToSuccess(page,wallet,[],120000)
          expect((await tokenOwner()).toLowerCase()).toBe(recipient.toLowerCase())
          if(!f.wrappedFor(f.leaf))expect((await registryOwner()).toLowerCase()).toBe(recipient.toLowerCase())
          if(wrapperBefore){const after=await publicClient.readContract({address:V1_NAME_WRAPPER,abi,functionName:'getData',args:[BigInt(node)]});expect(after.slice(1)).toEqual(wrapperBefore.slice(1))}
          expect(await resolveRecords(f.leaf,f.records)).toEqual(evidence.beforeRecords)
          expect((await sourceRecords(f.leaf,f.records)).every(r=>r.got===r.want)).toBe(true)
        }else{
          await expect(page.getByText(legacyTransferDenialTitle).first()).toBeVisible({timeout:60000})
          if(evidence.transferAuthority.requiresReissue)await expect(page.getByText('This subname has expired',{exact:true})).toBeVisible()
          await expect(page.getByRole('button',{name:'Transfer name',exact:true})).toHaveCount(0)
          expect(await registryOwner()).toBe(originalManager);expect(await resolveRecords(f.leaf,f.records)).toEqual(evidence.beforeRecords)
          if(wrapperBefore)expect(await publicClient.readContract({address:V1_NAME_WRAPPER,abi,functionName:'getData',args:[BigInt(node)]})).toEqual(wrapperBefore)
        }
        evidence.checks['V1 full transfer permission and outcome']={result:'PASS',expected:allowed?'allowed':'denied'}
        evidence.appChecks.push({app:'Explorer',actor,stage,action:'full name transfer',result:'PASS',evidence:{authority:evidence.transferAuthority},detail:allowed?'Actual transfer reached the recipient; all records retained, wrapped fuses/expiry unchanged. For an unwrapped2LD, both registrant and manager changed.':evidence.transferAuthority.requiresReissue?'Loaded expired-subname refusal matched the live zero holder. Wrapper state and records unchanged. Parent re-issue is a separate workflow, not a successful transfer.':'Loaded transfer refusal matched holder and parent contract authority; name and records unchanged.'})
        evidence.phase='completed legacy full transfer check'
      }catch(error){evidence.error=String(error);evidence.appChecks.push({app:'Explorer',actor,stage,action:evidence.phase==='before reclaim manager'?'reclaim manager':'full name transfer',result:['fixture','actual migration refusal'].includes(evidence.phase)?'BLOCKED':'FAIL',detail:String(error)});throw error}
      finally{
        if(page){evidence.screen=await page.locator('body').innerText().catch(()=>'');evidence.queryFailures=await queryFailures(page);await page.screenshot({path:resolve(out,`legacy-transfer-${c.config_id}-${actor}.png`),fullPage:true}).catch(()=>{})}
        if(f){
          evidence.finalRecords=await resolveRecords(f.leaf,f.records).catch(e=>String(e));evidence.afterRecords=evidence.finalRecords
          evidence.afterState=await v2State(f.leaf);evidence.afterRoot=await v2State(f.root)
          evidence.afterTreeStates=await Promise.all(f.names.map(async name=>({name,state:await v2State(name)})))
          evidence.afterActivity=await chainActivity(f.startBlock);evidence.activity=evidence.afterActivity
        }
        evidence.completedAt=new Date().toISOString();evidence.assertionErrors=info.errors.map(e=>e.message);save();await closeFixtureContext(context)
      }
    })
  }
}

import { refusalCheckpoint } from '../refusal-checkpoint.js'
