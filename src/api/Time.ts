/**
 * Gantt-Schedule-Timeline-Calendar
 *
 * @copyright Rafal Pospiech <https://neuronet.io>
 * @author    Rafal Pospiech <neuronet.io@gmail.com>
 * @package   gantt-schedule-timeline-calendar
 * @license   AGPL-3.0
 */

import dayjs, { OpUnitType } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  Locale,
  ChartInternalTime,
  Period,
  ChartCalendarAdditionalSpace,
  ChartCalendar,
  ChartCalendarAdditionalSpaces
} from '../types';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(advancedFormat);
dayjs.extend(weekOfYear);

export default class TimeApi {
  private locale: Locale;
  private utcMode = false;
  private state: any;

  constructor(state) {
    this.state = state;
    this.locale = state.get('config.locale');
    this.utcMode = state.get('config.utcMode');
    if (this.utcMode) {
      dayjs.extend(utc);
    }
    // @ts-ignore
    dayjs.locale(this.locale, null, true);
  }

  public date(time) {
    const _dayjs = this.utcMode ? dayjs.utc : dayjs;
    return time ? _dayjs(time).locale(this.locale.name) : _dayjs().locale(this.locale.name);
  }

  private addAdditionalSpace(time: ChartInternalTime) {
    if (time.additionalSpaces && time.additionalSpaces[time.period]) {
      const add = time.additionalSpaces[time.period];
      if (add.before) {
        time.finalFrom = this.date(time.from)
          .subtract(add.before, add.period)
          .valueOf();
      }
      if (add.after) {
        time.finalTo = this.date(time.to)
          .add(add.after, add.period)
          .valueOf();
      }
    }
    return time;
  }

  public recalculateFromTo(time: ChartInternalTime) {
    const period = time.period;
    time = { ...time };
    time.from = +time.from;
    time.to = +time.to;
    time.finalFrom = time.from;
    time.finalTo = time.to;

    let from = Number.MAX_SAFE_INTEGER,
      to = 0;
    const items = this.state.get('config.chart.items');
    if (Object.keys(items).length === 0) {
      return time;
    }
    if (time.from === 0 || time.to === 0) {
      for (const itemId in items) {
        const item = items[itemId];
        if (item.time.start < from && item.time.start) {
          from = item.time.start;
        }
        if (item.time.end > to) {
          to = item.time.end;
        }
      }
      if (time.from === 0) {
        time.from = this.date(from)
          .startOf(period)
          .valueOf();
      }
      if (time.to === 0) {
        time.to = this.date(to)
          .endOf(period)
          .valueOf();
      }
    }
    time.finalFrom = time.from;
    time.finalTo = time.to;
    time = this.addAdditionalSpace(time);
    return time;
  }

  public getCenter(time: ChartInternalTime) {
    return time.leftGlobal + (time.rightGlobal - time.leftGlobal) / 2;
  }

  public timeToPixelOffset(milliseconds: number): number {
    const timePerPixel = this.state.get('_internal.chart.time.timePerPixel') || 1;
    return milliseconds / timePerPixel;
  }

  public globalTimeToViewPixelOffset(milliseconds: number, withCompensation = false): number {
    const time = this.state.get('_internal.chart.time');
    let xCompensation = this.state.get('config.scroll.compensation.x') || 0;
    const viewPixelOffset = (milliseconds - time.leftGlobal) / time.timePerPixel;
    if (withCompensation) return viewPixelOffset + xCompensation;
    return viewPixelOffset;
  }
}
