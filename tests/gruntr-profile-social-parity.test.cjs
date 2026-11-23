const test = require('node:test');
const assert = require('node:assert/strict');
const { collect, ownSharedPosts, commentable } = require('../js/gruntr-profile-activity.js');
const owner = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const workout = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const serverWorkout = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
const day = '2026-11-22';
const now = Date.parse(day+'T12:00:00Z');
function workoutPost(account = owner, props = 0) {
  return { event_id: 'workout:'+account+':'+workout, event_type:'workout', is_own:true, props_count:props };
}

test('trusted feed only admits exact owner, identifier type, and real integer count; 0 stays 0', () => {
  const gym = {event_id:'gym:'+owner+':'+day,event_type:'gym_visit',is_own:true,props_count:3};
  const posts = ownSharedPosts([
    workoutPost(), gym, workoutPost(other), workoutPost(owner,'2'), workoutPost(owner,null),
    {...workoutPost(owner,7), event_type:'gym_visit'},
    {...workoutPost(owner,8), is_own:false},
    {...workoutPost(owner,9), event_id:'workout:'+owner+':'+workout+':extra'}
  ],owner);
  assert.deepEqual([...posts].map(([key,value])=>[key,value.props_count]), [['workout:'+workout,0], ['gym:'+day,3]]);
  assert.equal(ownSharedPosts([workoutPost()], 'coach-preview').size,0);
});

test('comments expire after 72 h, and reject invalid or future timestamps', () => {
  const at = offset => ({occurred_at:new Date(now+offset).toISOString()});
  assert.equal(commentable(at(-72*3600000),now),true);
  assert.equal(commentable(at(-72*3600000-1),now),false);
  assert.equal(commentable(at(1),now),false);
  assert.equal(commentable({},now),false);
});

test('shared matching uses server session precedence and rejects duplicates across private groups', () => {
  const record = {id:other, session_id:workout, workout_session_id:serverWorkout, entry_date:day,
    completed_at:day+'T10:00:00Z',updated_at:day+'T10:00:00Z'};
  const entries = logs => collect({logs,today:day,sessionKey:row=>'session:'+row.session_id}).entries;
  const [event] = entries([record]);
  assert.deepEqual([...event.postIDs],[serverWorkout]);
  assert.equal(event.hasSavedSession,true);
  assert.deepEqual(entries([record,{...record,session_id:owner}]).flatMap(row=>[...row.postIDs]),[null,null]);
  assert.equal(entries([{...record,updated_at:null}])[0].hasSavedSession,false);
  assert.equal(entries([{...record,completed_at:null}]).length,0);
});
