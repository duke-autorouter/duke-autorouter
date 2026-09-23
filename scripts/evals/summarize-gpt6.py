import json, argparse
from pathlib import Path
parser=argparse.ArgumentParser(description='Price complete GPT-6 development receipts using dated API-equivalent rates')
parser.add_argument('--results-root',required=True)
parser.add_argument('--prices',required=True)
parser.add_argument('--out',required=True)
args=parser.parse_args()
base=Path(args.results_root)
rates=json.loads(Path(args.prices).read_text())['rates'];out=[]
for mode in ['jev','astra-medium','luna-low','probe']:
 p=base/mode/'results.json'
 if not p.exists():continue
 r=json.loads(p.read_text());assert r.get('finishedAt'),mode
 rows=[]
 for x in r['results']:
  starts={e['data']['id']:e['data'] for e in x['events'] if e['kind']=='usage_started' and e['data'].get('role')=='worker'}
  reports={e['data']['id']:e['data']['usage'] for e in x['events'] if e['kind']=='usage_report' and e['data']['usage'].get('complete')}
  workers=[]
  for key,st in starts.items():
   u=reports.get(key);assert u,(mode,x['caseId'],'missing usage')
   rate=rates[st['modelId']];inp=u.get('inputTokens',0);cached=u.get('cachedInputTokens',0);written=u.get('cacheWriteInputTokens',0);op=u.get('outputTokens',0);assert inp>=cached+written
   # All observed attempts are below the long-context threshold in aggregate,
   # therefore each request is also below it.
   assert inp<=272000, 'Inspect per-request context before pricing this attempt'
   cost=((inp-cached-written)*rate['input']+cached*rate['cachedInput']+written*rate['cacheWrite']+op*rate['output'])/1e6
   workers.append({'model':st['modelId'],'usage':u,'apiEquivalentUSD':cost})
  rows.append({'caseId':x['caseId'],'status':x['status'],'reviewStatus':x.get('automaticReview',{}).get('status'),'routeSource':x.get('route',{}).get('selectionSource'),'route':{k:x.get('route',{}).get(k) for k in ['modelId','effort']},'caseHash':x['caseHash'],'workers':workers,'jevAPIUSD':x['apiCostUSD'],'proxyTotalUSD':sum(w['apiEquivalentUSD'] for w in workers)+x['apiCostUSD'],'unreconciledRequests':x['unreconciledRequests'],'acceptance':x.get('acceptance')})
 out.append({'mode':mode,'fixtureHash':r['fixtureHash'],'sourceCommit':r.get('sourceCommit'),'rows':rows,'totalProxyUSD':sum(x['proxyTotalUSD'] for x in rows),'jevAPIUSD':sum(x['jevAPIUSD'] for x in rows)})
Path(args.out).write_text(json.dumps(out,indent=2)+'\n')
for m in out:print(m['mode'],m['totalProxyUSD'],m['jevAPIUSD'],[(x['caseId'],x['reviewStatus'],len(x['workers'])) for x in m['rows']])
