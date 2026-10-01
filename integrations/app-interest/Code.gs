const SHEET_ID = '1Qg4_2On4sRkBbj5mapcDgJtRRPN4Nrc4yfk-_QE8aTw';
const TAB = 'App Interest';
const NOTIFY_EMAIL = 'benjaminbenz.fit@gmail.com';
const RESPONSES_URL = 'https://docs.google.com/spreadsheets/d/1Qg4_2On4sRkBbj5mapcDgJtRRPN4Nrc4yfk-_QE8aTw/edit#gid=360317381';
const EXPECTED_HEADERS = ['Signup date', 'Name', 'Email', 'Phone (optional)', 'Primary fitness goal', 'Training experience', 'Device', 'Contact consent', 'Status', 'Invitation date', 'Follow-up date', 'Notes'];
function notifyNewSignup(name,email,goal,experience,device) {
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'New FWB app interest signup',
    body: [
      'A new person joined the FWB app interest list.',
      '',
      'Name: '+name,
      'Email: '+email,
      'Goal: '+goal,
      'Experience: '+experience,
      'Device: '+device,
      '',
      'Open responses: '+RESPONSES_URL
    ].join('\n'),
    name: 'FWB Signup'
  });
}
function responsePage(ok) {
  const title = ok ? "You're on the list!" : 'Your signup could not be saved.';
  const detail = ok ? 'Benjamin will follow up about trying the FWB app.' : 'Please return to the signup page and try again.';
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>FWB app interest</title></head><body style="font:18px Arial;background:#f2f3ee;padding:32px;line-height:1.6"><main style="max-width:560px;margin:auto"><h1>'+title+'</h1><p>'+detail+'</p><a href="https://benjaminbenz.com/" target="_top">Back to FWB</a></main></body></html>');
}
function doPost(e) {
  const p = e && e.parameter || {};
  const text = (key, max) => String(p[key] || '').trim().slice(0,max);
  const name=text('name',120), email=text('email',254).toLowerCase(), phone=text('phone',40);
  const goal=text('goal',80), experience=text('experience',40), device=text('device',40);
  if (p.website || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || p.consent !== 'Yes' ||
      !['Build muscle','Lose body fat','Get stronger','Improve consistency','General fitness','Other'].includes(goal) ||
      !['Beginner','Intermediate','Advanced'].includes(experience) ||
      !['iPhone','Android','Computer or tablet','Multiple devices'].includes(device)) return responsePage(false);
  // Prevent user-controlled text from becoming spreadsheet formulas.
  const safe = value => /^[=+@\-\t\r]/.test(value) ? "'"+value : value;
  const lock=LockService.getScriptLock();
  let newSignup=null;
  try {
    lock.waitLock(10000);
    const sheet=SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
    if(!sheet) throw new Error('Missing interest sheet');
    // Fail safely if the expected header row was removed or columns were moved.
    // Never treat a first signup as headers or rewrite existing sheet content.
    const headers=sheet.getRange(1,1,1,EXPECTED_HEADERS.length).getDisplayValues()[0];
    if(!EXPECTED_HEADERS.every((expected,index)=>headers[index]===expected)) {
      throw new Error('Missing or unexpected interest sheet headers');
    }
    const last=sheet.getLastRow();
    const emails=last>1 ? sheet.getRange(2,3,last-1,1).getDisplayValues().flat() : [];
    if(!emails.some(existing=>existing.toLowerCase()===email)) {
      sheet.appendRow([new Date(),safe(name),safe(email),safe(phone),goal,experience,device,'Yes','New','','','']);
      SpreadsheetApp.flush();
      newSignup={name,email,goal,experience,device};
    }
  } catch(error) { console.error('App interest submission failed'); return responsePage(false); }
  finally { if(lock.hasLock()) lock.releaseLock(); }
  // Release the signup lock before sending email so notification latency cannot block submissions.
  // Keep the saved signup successful if email delivery is temporarily unavailable.
  if(newSignup) {
    try { notifyNewSignup(newSignup.name,newSignup.email,newSignup.goal,newSignup.experience,newSignup.device); }
    catch(notificationError) { console.error('App interest notification failed'); }
  }
  return responsePage(true);
}
