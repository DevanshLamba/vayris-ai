import * as chrono from 'chrono-node';

function parseAdvancedTime(input: string): { date: Date, hasTime: boolean, hasDate: boolean } | null {
  const results = chrono.parse(input);
  if (results.length === 0) return null;
  
  if (results.length === 1) {
    const d = results[0].date();
    const hasHourOrMinute = results[0].start.isCertain('hour') || results[0].start.isCertain('minute');
    const hasSecond = results[0].start.isCertain('second');
    const hasDate = results[0].start.isCertain('day') || results[0].start.isCertain('weekday');
    if (hasHourOrMinute && !hasSecond) {
      d.setSeconds(0);
      d.setMilliseconds(0);
    }
    return { date: d, hasTime: hasHourOrMinute, hasDate };
  }
  
  const finalDate = results[0].date();
  let hasHourOrMinute = results[0].start.isCertain('hour') || results[0].start.isCertain('minute');
  let hasSecond = results[0].start.isCertain('second');
  
  for (let i = 1; i < results.length; i++) {
    const comp = results[i].start;
    
    if (comp.isCertain('year')) finalDate.setFullYear(comp.get('year')!);
    if (comp.isCertain('month')) finalDate.setMonth(comp.get('month')! - 1);
    if (comp.isCertain('day')) finalDate.setDate(comp.get('day')!);
    
    if (comp.isCertain('hour')) finalDate.setHours(comp.get('hour')!);
    if (comp.isCertain('minute')) finalDate.setMinutes(comp.get('minute')!);
    if (comp.isCertain('second')) finalDate.setSeconds(comp.get('second')!);
    if (comp.isCertain('millisecond')) finalDate.setMilliseconds(comp.get('millisecond')!);
    
    if (comp.isCertain('hour') || comp.isCertain('minute')) hasHourOrMinute = true;
    if (comp.isCertain('second')) hasSecond = true;
  }
  
  if (hasHourOrMinute && !hasSecond) {
    finalDate.setSeconds(0);
    finalDate.setMilliseconds(0);
  }
  
  return { date: finalDate, hasTime: hasHourOrMinute, hasDate: results.some(r => r.start.isCertain('day') || r.start.isCertain('weekday')) };
}

export { parseAdvancedTime };
