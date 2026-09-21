import { beforeAll, expect, it } from 'vitest';
import exams from '../routes/exams.js';
import qb from '../routes/questionBank.js';
import { generateTokens } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { users, branches, academicYears, classes, students } from '../db/schema.js';
import { eq } from 'drizzle-orm';
const parishId='audit-omr-20260921', userId='audit-omr-admin', classId='audit-omr-class', studentId='audit-omr-student';
const token=generateTokens({userId,username:userId,role:'admin',parishId,tokenVersion:1}).accessToken;
async function req(app:any,path:string,method='GET',body?:unknown) {
 const response=await app.request(path,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});
 const json:any=await response.json(); return {status:response.status,...json};
}
beforeAll(async()=>{
 await db.insert(users).values({id:userId,username:userId,passwordHash:'hash',fullName:'Audit Admin',role:'admin',parishId});
 await db.insert(branches).values({id:'audit-omr-branch',name:'Audit',scarfColor:'Blue',ageMin:8,ageMax:14,parishId});
 await db.insert(academicYears).values({id:'2026-2027',startDate:'2026-08-01',endDate:'2027-06-30',parishId});
 await db.insert(classes).values({id:classId,code:classId,name:'Audit class',branchId:'audit-omr-branch',academicYearId:'2026-2027',parishId});
 await db.insert(students).values({id:studentId,code:studentId,holyName:'',fullName:'Synthetic Student',gender:'Nam',dateOfBirth:'2014-01-01',parentName:'',parentPhone:'',address:'',branch:'ThieuNhi',classId,parishId});
});
const base={classId,subject:'Audit',scoreType:'midterm',semester:1,academicYear:'2026-2027',maxScore:10};
const mc=(index:number,points:number)=>({index,type:'multiple_choice',question:`Question ${index}`,options:{A:'one',B:'two',C:'three',D:'four'},correctOption:'A',points});
const meta=(examVersion:string,questionCount:number)=>JSON.stringify({detectionStatus:'accepted',examVersion,questionCount});
async function create(extra:any={}){const r=await req(exams,'/','POST',{...base,examType:'written',...extra});expect(r.status).toBe(201);return r.data;}
async function save(id:string,score:any){return req(exams,`/${id}/results`,'POST',{results:[{studentId,...score}]});}
it('mixed B-H scores the moved question with its materialized weight through finalization',async()=>{
 const s=await create({examType:'mixed',questionCount:2,answerKey:JSON.stringify({1:'A',2:'A'}),questions:JSON.stringify([mc(1,1),mc(2,4),{index:3,type:'essay',question:'Essay',points:5}])});
 const m=await req(exams,`/${s.id}/variant-manifests`,'POST',{variantCount:8,seed:'audit-weight-seed'});expect(m.status).toBe(200);
 const session=m.data.session;const manifests=JSON.parse(session.variantManifests);
 const variant:any=Object.values(manifests.variants).find((v:any)=>v.sourceQuestionOrder[0]===2);expect(variant).toBeTruthy();
 const answers={1:variant.answerKey[1],2:null};expect(variant.questions[0].points).toBe(4);
 const r=await save(s.id,{score:4,essayScore:0,source:'omr',examVersion:variant.version,answers:JSON.stringify(answers),scanMetadata:meta(variant.version,2),clientMutationId:'audit-mixed-weight-001'});
 expect(r.status).toBe(200);expect(r.data.items[0].serverScore).toBe(4);
 const f=await req(exams,`/${s.id}/complete`,'POST');expect(f.status).toBe(200);expect(f.data.items[0].finalScore).toBe(4);
});
async function activeQuestion(topic:string){const q=await req(qb,'/questions','POST',{questionType:'multiple_choice',stem:`Question ${topic}`,topic,answerData:{options:[{id:'A',text:'one'},{id:'B',text:'two'},{id:'C',text:'three'},{id:'D',text:'four'}],correctOptionIds:['A']}});expect(q.status).toBe(201);for(const action of ['submit','approve','activate'])expect((await req(qb,`/questions/${q.data.id}/lifecycle`,'POST',{action})).status).toBe(200);return q.data.id;}
it('all-MC blueprint scores its approved 1/9 weights while legacy MC keeps equal scoring',async()=>{
 await activeQuestion('light');await activeQuestion('heavy');
 const b=await req(qb,'/blueprints','POST',{name:'Weighted MC',totalQuestions:2,maxScore:10,rules:[{questionType:'multiple_choice',topic:'light',questionCount:1,pointsEach:1},{questionType:'multiple_choice',topic:'heavy',questionCount:1,pointsEach:9}]});expect(b.status).toBe(201);
 expect((await req(qb,`/blueprints/${b.data.id}/status`,'POST',{status:'active'})).status).toBe(200);
 const build=await req(qb,'/exams/build','POST',{...base,mode:'blueprint',blueprintId:b.data.id,variantCount:8,buildCommandId:'audit-blueprint-weighted-001'});expect(build.status).toBe(201);
 const q=JSON.parse(build.data.questions);expect(q[0].points).toBe(1);expect(q[1].points).toBe(9);
 const r=await save(build.data.id,{score:5,source:'omr',answers:JSON.stringify({1:'A',2:null}),scanMetadata:meta('A',2),examVersion:'A'});expect(r.status).toBe(200);expect(r.data.items[0].serverScore).toBe(1);
 const variants=JSON.parse(build.data.variantManifests).variants;
 const moved:any=Object.values(variants).find((variant:any)=>variant.questions[0].points===9);expect(moved).toBeTruthy();
 const movedScore=await save(build.data.id,{score:5,source:'omr',answers:JSON.stringify({1:moved.answerKey[1],2:null}),scanMetadata:meta(moved.version,2),examVersion:moved.version,expectedResultVersion:1});
 expect(movedScore.status).toBe(200);expect(movedScore.data.items[0].serverScore).toBe(9);
 const legacy=await create({examType:'multiple_choice',questionCount:2,answerKey:JSON.stringify({1:'A',2:'A'})});
 const legacyResult=await save(legacy.id,{score:1,source:'omr',answers:JSON.stringify({1:'A',2:null}),scanMetadata:meta('A',2)});
 expect(legacyResult.status).toBe(200);expect(legacyResult.data.items[0].serverScore).toBe(5);
});
it('stale delete conflicts and exact replay leaves a replacement result intact',async()=>{
 const s=await create();const created=await save(s.id,{score:2,source:'quick_entry'});expect(created.status).toBe(200);
 const resultId=created.data.items[0].resultId;expect(resultId).toBeTruthy();
 expect((await save(s.id,{score:9,source:'quick_entry',expectedResultVersion:1})).status).toBe(200);
 const params=new URLSearchParams({expectedResultId:resultId,expectedResultVersion:'1',clientMutationId:'audit-stale-delete-001'});
 expect((await req(exams,`/${s.id}/results/${studentId}?${params}`,'DELETE')).status).toBe(409);
 params.set('expectedResultVersion','2');params.set('clientMutationId','audit-exact-delete-001');
 const path=`/${s.id}/results/${studentId}?${params}`;
 expect((await req(exams,path,'DELETE')).status).toBe(200);
 const replacement=await save(s.id,{score:8,source:'quick_entry'});expect(replacement.status).toBe(200);
 expect(replacement.data.items[0].resultId).not.toBe(resultId);
 const retry=await req(exams,path,'DELETE');expect(retry.status).toBe(200);expect(retry.data.duplicate).toBe(true);
 const rows=await req(exams,`/${s.id}/results`);expect(rows.data.results).toHaveLength(1);expect(rows.data.results[0].score).toBe(8);
});
it('an offline save/delete chain deletes only the result created by its acknowledged predecessor',async()=>{
 const s=await create();
 const saveId='audit-offline-save-before-delete-001';
 const created=await save(s.id,{score:7,source:'quick_entry',clientMutationId:saveId});expect(created.status).toBe(200);
 const resultId=created.data.items[0].resultId;
 const deleteId='audit-offline-delete-after-save-001';
 const params=new URLSearchParams({clientMutationId:deleteId,afterMutationId:saveId});
 const path=`/${s.id}/results/${studentId}?${params}`;
 const deleted=await req(exams,path,'DELETE');expect(deleted.status).toBe(200);expect(deleted.data.resultId).toBe(resultId);
 const replacement=await save(s.id,{score:9,source:'quick_entry'});expect(replacement.status).toBe(200);
 expect((await req(exams,path,'DELETE')).data.duplicate).toBe(true);
 const rows=await req(exams,`/${s.id}/results`);expect(rows.data.results).toHaveLength(1);expect(rows.data.results[0].score).toBe(9);
});
it('a queued essay edit waits for its acknowledged scan and rejects a stale predecessor',async()=>{
 const s=await create({examType:'mixed',questionCount:1,answerKey:JSON.stringify({1:'A'}),questions:JSON.stringify([mc(1,2),{index:2,type:'essay',question:'Essay',points:8}])});
 const scanId='audit-scan-before-essay-001';
 const essay={score:4,essayScore:4,source:'omr',examVersion:'A',answers:JSON.stringify({1:'A'}),scanMetadata:meta('A',1),clientMutationId:'audit-essay-after-scan-001',afterMutationId:scanId};
 expect((await save(s.id,essay)).status).toBe(409);
 const scan=await save(s.id,{score:2,source:'omr',answers:JSON.stringify({1:'A'}),scanMetadata:meta('A',1),examVersion:'A',clientMutationId:scanId});expect(scan.status).toBe(200);
 const edit=await save(s.id,essay);expect(edit.status).toBe(200);expect(edit.data.items[0].serverScore).toBe(6);
 expect(edit.data.items[0].resultVersion).toBe(2);
 const concurrent=await save(s.id,{score:7,essayScore:5,source:'quick_entry',afterMutationId:scanId,clientMutationId:'audit-stale-dependent-001'});
 expect(concurrent.status).toBe(409);
});
it('exact save receipt replays after finalization without permitting a changed payload',async()=>{
 const s=await create();const score={score:8,source:'quick_entry',clientMutationId:'audit-lost-ack-retry-001'};
 expect((await save(s.id,score)).status).toBe(200);
 expect((await req(exams,`/${s.id}/complete`,'POST')).status).toBe(200);
 const r=await save(s.id,score);expect(r.status).toBe(200);expect(r.data.items[0].status).toBe('duplicate');
 const changed=await save(s.id,{...score,score:9});expect(changed.status).toBe(409);expect(changed.error.code).toBe('IDEMPOTENCY_CONFLICT');
});
it('bank builder rejects a soft-deleted class as ordinary exam creation does',async()=>{
 const q=await activeQuestion('deleted-class');const deletedClass='audit-omr-deleted-class';
 await db.insert(classes).values({id:deletedClass,code:deletedClass,name:'Deleted',branchId:'audit-omr-branch',academicYearId:'2026-2027',deletedAt:new Date().toISOString(),parishId});
 expect((await req(exams,'/','POST',{...base,classId:deletedClass,examType:'written'})).status).toBe(404);
 const r=await req(qb,'/exams/build','POST',{...base,classId:deletedClass,mode:'manual',questionIds:[q],variantCount:1,buildCommandId:'audit-deleted-class-001'});expect(r.status).toBe(404);
});
it('bank build receipt still replays after its class is archived, without permitting a new build',async()=>{
 const target='audit-omr-class-after-build';
 await db.insert(classes).values({id:target,code:target,name:'Before archive',branchId:'audit-omr-branch',academicYearId:'2026-2027',parishId});
 const q=await activeQuestion('archived-after-build');
 const command={...base,classId:target,mode:'manual',questionIds:[q],variantCount:1,buildCommandId:'audit-build-before-archive-001'};
 const created=await req(qb,'/exams/build','POST',command);expect(created.status).toBe(201);
 await db.update(classes).set({deletedAt:new Date().toISOString()}).where(eq(classes.id,target));
 const retry=await req(qb,'/exams/build','POST',command);expect(retry.status).toBe(201);expect(retry.data.id).toBe(created.data.id);
 const next=await req(qb,'/exams/build','POST',{...command,buildCommandId:'audit-build-after-archive-001'});expect(next.status).toBe(404);
});
it('server recomputes both components of a complete mixed queue command',async()=>{
 const s=await create({examType:'mixed',questionCount:1,answerKey:JSON.stringify({1:'A'}),questions:JSON.stringify([mc(1,2),{index:2,type:'essay',question:'Essay',points:8}])});
 // Shape observed in the independent real-Dexie (fake-IDB) frontend probe.
 const r=await save(s.id,{score:4,essayScore:4,source:'omr',examVersion:'A',answers:JSON.stringify({1:'A'}),scanMetadata:meta('A',1),expectedResultVersion:0,clientMutationId:'audit-complete-mixed-001'});
 expect(r.status).toBe(200);expect(r.data.items[0].serverScore).toBe(6);
 const result=(await req(exams,`/${s.id}/results`)).data.results[0];expect(result.answers).toBeTruthy();expect(result.essayScore).toBe(4);
});
