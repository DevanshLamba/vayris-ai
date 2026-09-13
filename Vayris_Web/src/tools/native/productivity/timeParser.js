// @ts-nocheck
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAdvancedTime = parseAdvancedTime;
const chrono = __importStar(require("chrono-node"));
function parseAdvancedTime(input) {
    const results = chrono.parse(input);
    if (results.length === 0)
        return null;
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
        if (comp.isCertain('year'))
            finalDate.setFullYear(comp.get('year'));
        if (comp.isCertain('month'))
            finalDate.setMonth(comp.get('month') - 1);
        if (comp.isCertain('day'))
            finalDate.setDate(comp.get('day'));
        if (comp.isCertain('hour'))
            finalDate.setHours(comp.get('hour'));
        if (comp.isCertain('minute'))
            finalDate.setMinutes(comp.get('minute'));
        if (comp.isCertain('second'))
            finalDate.setSeconds(comp.get('second'));
        if (comp.isCertain('millisecond'))
            finalDate.setMilliseconds(comp.get('millisecond'));
        if (comp.isCertain('hour') || comp.isCertain('minute'))
            hasHourOrMinute = true;
        if (comp.isCertain('second'))
            hasSecond = true;
    }
    if (hasHourOrMinute && !hasSecond) {
        finalDate.setSeconds(0);
        finalDate.setMilliseconds(0);
    }
    return { date: finalDate, hasTime: hasHourOrMinute, hasDate: results.some(r => r.start.isCertain('day') || r.start.isCertain('weekday')) };
}
