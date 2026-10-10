import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
test('owner reset deletes only the inspected account and leaves a recreated email intact',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')&&!f.startsWith('0010')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const target='LH-8201ee36-508f-4d0c-b8f3-e989b8fbd3aa',other='LH-control';const add=(id,email)=>{db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?)').run(id,email,'Fixture','08012345678','both','hash','salt','now');db.prepare('INSERT INTO wallets(user_id) VALUES (?)').run(id);db.prepare('INSERT INTO sessions VALUES (?,?,?)').run('session-'+id,id,9999999999999);};
 add(target,'owner@example.test');add(other,'other@example.test');db.prepare('INSERT INTO live_profiles (id,user_id,role,data,updated_at) VALUES (?,?,?,?,?)').run('profile',target,'employer','{}','now');db.prepare('INSERT INTO live_openings (id,employer_id,status,data,created_at) VALUES (?,?,?,?,?)').run('opening','profile','Open','{}','now');
 const reset=readFileSync(new URL('../drizzle/0010_owner_test_reset.sql',import.meta.url),'utf8');db.exec(reset);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,1);assert.equal(db.prepare('SELECT id FROM users').get().id,other);assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM live_profiles').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM live_openings').get().n,0);
 add('LH-recreated','owner@example.test');db.exec(reset);assert.equal(db.prepare('SELECT id FROM users WHERE email=?').get('owner@example.test').id,'LH-recreated');db.close();
});
