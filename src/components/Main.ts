/**
 * Main component
 *
 * @copyright Rafal Pospiech <https://neuronet.io>
 * @author    Rafal Pospiech <neuronet.io@gmail.com>
 * @package   gantt-schedule-timeline-calendar
 * @license   AGPL-3.0 (https://github.com/neuronetio/gantt-schedule-timeline-calendar/blob/master/LICENSE)
 * @link      https://github.com/neuronetio/gantt-schedule-timeline-calendar
 */

import ResizeObserver from 'resize-observer-polyfill';
import {
  ChartCalendarAdditionalSpace,
  ChartTime,
  ChartInternalTime,
  Period,
  ChartInternalTimeLevel,
  ChartCalendar
} from '../types';

export default function Main(vido, props = {}) {
  const { api, state, onDestroy, Actions, update, createComponent, html, StyleMap, schedule } = vido;
  const componentName = api.name;
  const periodDivider = {
    minute: 60000,
    hour: 3600000,
    day: 86400000
  };

  // Initialize plugins
  onDestroy(
    state.subscribe('config.plugins', plugins => {
      if (typeof plugins !== 'undefined' && Array.isArray(plugins)) {
        for (const initializePlugin of plugins) {
          const destroyPlugin = initializePlugin(vido);
          if (typeof destroyPlugin === 'function') {
            onDestroy(destroyPlugin);
          } else if (destroyPlugin && destroyPlugin.hasOwnProperty('destroy')) {
            destroyPlugin.destroy();
          }
        }
      }
    })
  );

  const componentSubs = [];
  let ListComponent;
  componentSubs.push(state.subscribe('config.components.List', value => (ListComponent = value)));
  let ChartComponent;
  componentSubs.push(state.subscribe('config.components.Chart', value => (ChartComponent = value)));

  const List = createComponent(ListComponent);
  onDestroy(List.destroy);
  const Chart = createComponent(ChartComponent);
  onDestroy(Chart.destroy);

  onDestroy(() => {
    componentSubs.forEach(unsub => unsub());
  });

  let wrapper;
  onDestroy(state.subscribe('config.wrappers.Main', value => (wrapper = value)));

  const componentActions = api.getActions('main');
  let className, classNameVerticalScroll;
  const styleMap = new StyleMap({}),
    verticalScrollStyleMap = new StyleMap({}),
    verticalScrollAreaStyleMap = new StyleMap({});
  let verticalScrollBarElement;
  let rowsHeight = 0;
  let resizerActive = false;

  /**
   * Update class names
   * @param {object} classNames
   */
  const updateClassNames = classNames => {
    const config = state.get('config');
    className = api.getClass(componentName, { config });
    if (resizerActive) {
      className += ` ${componentName}__list-column-header-resizer--active`;
    }
    classNameVerticalScroll = api.getClass('vertical-scroll', { config });
    update();
  };
  onDestroy(state.subscribe('config.classNames', updateClassNames));

  /**
   * Height change
   */
  function heightChange() {
    const config = state.get('config');
    const scrollBarHeight = state.get('_internal.scrollBarHeight');
    const height = config.height - config.headerHeight - scrollBarHeight;
    state.update('_internal.height', height);
    styleMap.style['--height'] = config.height + 'px';
    verticalScrollStyleMap.style.height = height + 'px';
    verticalScrollStyleMap.style.width = scrollBarHeight + 'px';
    verticalScrollStyleMap.style['margin-top'] = config.headerHeight + 'px';
    update();
  }
  onDestroy(state.subscribeAll(['config.height', 'config.headerHeight', '_internal.scrollBarHeight'], heightChange));

  /**
   * Resizer active change
   * @param {boolean} active
   */
  function resizerActiveChange(active) {
    resizerActive = active;
    className = api.getClass(api.name);
    if (resizerActive) {
      className += ` ${api.name}__list-column-header-resizer--active`;
    }
    update();
  }
  onDestroy(state.subscribe('_internal.list.columns.resizer.active', resizerActiveChange));

  /**
   * Generate tree
   * @param {object} bulk
   * @param {object} eventInfo
   */
  function generateTree(bulk, eventInfo) {
    if (state.get('_internal.flatTreeMap').length && eventInfo.type === 'subscribe') {
      return;
    }
    const configRows = state.get('config.list.rows');
    const rows = [];
    for (const rowId in configRows) {
      rows.push(configRows[rowId]);
    }
    api.fillEmptyRowValues(rows);
    const configItems = state.get('config.chart.items');
    const items = [];
    for (const itemId in configItems) {
      items.push(configItems[itemId]);
    }
    api.prepareItems(items);
    const treeMap = api.makeTreeMap(rows, items);
    state.update('_internal.treeMap', treeMap);
    const flatTreeMapById = api.getFlatTreeMapById(treeMap);
    state.update('_internal.flatTreeMapById', flatTreeMapById);
    const flatTreeMap = api.flattenTreeMap(treeMap);
    state.update('_internal.flatTreeMap', flatTreeMap);
    update();
  }

  onDestroy(state.subscribeAll(['config.list.rows;', 'config.chart.items;'], generateTree));
  onDestroy(
    state.subscribeAll(['config.list.rows.*.parentId', 'config.chart.items.*.rowId'], generateTree, { bulk: true })
  );

  function prepareExpanded() {
    const configRows = state.get('config.list.rows');
    const rowsWithParentsExpanded = api.getRowsFromIds(
      api.getRowsWithParentsExpanded(
        state.get('_internal.flatTreeMap'),
        state.get('_internal.flatTreeMapById'),
        configRows
      ),
      configRows
    );
    rowsHeight = api.getRowsHeight(rowsWithParentsExpanded);
    state.update('_internal.list.rowsHeight', rowsHeight);
    state.update('_internal.list.rowsWithParentsExpanded', rowsWithParentsExpanded);
    update();
  }
  onDestroy(
    state.subscribeAll(
      ['config.list.rows.*.expanded', '_internal.treeMap;', 'config.list.rows.*.height'],
      prepareExpanded,
      { bulk: true }
    )
  );

  /**
   * Generate visible rows
   */
  function generateVisibleRowsAndItems() {
    const { visibleRows, compensation } = api.getVisibleRowsAndCompensation(
      state.get('_internal.list.rowsWithParentsExpanded')
    );
    const smoothScroll = state.get('config.scroll.smooth');
    const currentVisibleRows = state.get('_internal.list.visibleRows');
    let shouldUpdate = true;
    state.update('config.scroll.compensation.y', smoothScroll ? -compensation : 0);
    if (visibleRows.length !== currentVisibleRows.length) {
      shouldUpdate = true;
    } else if (visibleRows.length) {
      shouldUpdate = visibleRows.some((row, index) => {
        if (typeof currentVisibleRows[index] === 'undefined') {
          return true;
        }
        return row.id !== currentVisibleRows[index].id;
      });
    }
    if (shouldUpdate) {
      state.update('_internal.list.visibleRows', visibleRows);
    }
    const visibleItems = [];
    for (const row of visibleRows) {
      for (const item of row._internal.items) {
        visibleItems.push(item);
      }
    }
    state.update('_internal.chart.visibleItems', visibleItems);
    update();
  }
  onDestroy(
    state.subscribeAll(
      ['_internal.list.rowsWithParentsExpanded;', 'config.scroll.top', 'config.chart.items'],
      generateVisibleRowsAndItems,
      { bulk: true }
    )
  );

  let elementScrollTop = 0;
  function onVisibleRowsChange() {
    const top = state.get('config.scroll.top');
    verticalScrollAreaStyleMap.style.width = '1px';
    verticalScrollAreaStyleMap.style.height = rowsHeight + 'px';
    if (elementScrollTop !== top && verticalScrollBarElement) {
      elementScrollTop = top;
      verticalScrollBarElement.scrollTop = top;
    }
    update();
  }
  onDestroy(state.subscribe('_internal.list.visibleRows;', onVisibleRowsChange));

  /**
   * Generate and add period dates
   * @param {string} period
   * @param {object} internalTime
   */
  const generatePeriodDates = (
    period: Period,
    periodSize: number,
    internalTime: ChartInternalTime
  ): ChartInternalTimeLevel => {
    const periodUsed = period === 'minute' ? 'hour' : period;
    const dates = [];
    let leftGlobal = internalTime.leftGlobal;
    const timePerPixel = internalTime.timePerPixel;
    let startOfLeft =
      Math.floor(
        api.time
          .date(leftGlobal)
          .startOf(periodUsed)
          .valueOf() /
          (periodDivider[period] * periodSize)
      ) *
      periodSize *
      periodDivider[period];
    if (startOfLeft < leftGlobal) startOfLeft = leftGlobal;
    let sub = leftGlobal - startOfLeft;
    let subPx = sub / timePerPixel;
    let leftPx = 0;
    let maxWidth = 0;
    const diff = Math.ceil(
      api.time
        .date(internalTime.rightGlobal)
        .endOf(periodUsed)
        .diff(api.time.date(leftGlobal).startOf(periodUsed), period, true) / periodSize
    );
    for (let i = 0; i < diff; i++) {
      const date = {
        sub,
        subPx,
        leftGlobal,
        rightGlobal:
          Math.round(
            api.time
              .date(leftGlobal)
              .add(periodSize, period)
              .valueOf() / 10
          ) * 10,
        width: 0,
        leftPx: 0,
        rightPx: 0,
        period
      };
      date.width = (date.rightGlobal - date.leftGlobal + sub) / timePerPixel;
      maxWidth = date.width > maxWidth ? date.width : maxWidth;
      date.leftPx = leftPx;
      leftPx += date.width;
      date.rightPx = leftPx;
      dates.push(date);
      leftGlobal = date.rightGlobal + 1;
      sub = 0;
      subPx = 0;
    }
    return dates;
  };

  function triggerLoadedEvent() {
    if (state.get('_internal.loadedEventTriggered')) return;
    Promise.resolve().then(() => {
      const element = state.get('_internal.elements.main');
      const parent = element.parentNode;
      const event = new Event('gstc-loaded');
      element.dispatchEvent(event);
      parent.dispatchEvent(event);
    });
    state.update('_internal.loadedEventTriggered', true);
  }

  function limitGlobalAndSetCenter(time: ChartInternalTime) {
    if (time.leftGlobal < time.finalFrom) time.leftGlobal = time.finalFrom;
    if (time.rightGlobal > time.finalTo) time.rightGlobal = time.finalTo;
    time.centerGlobal = time.leftGlobal + Math.round((time.rightGlobal - time.leftGlobal) / 2);
    return time;
  }

  function guessPeriod(time: ChartInternalTime, calendar: ChartCalendar) {
    if (!time.zoom) return time;
    for (const level of calendar.levels) {
      const formatting = level.formats.find(format => +time.zoom <= +format.zoomTo);
      if (formatting && level.main) {
        time.period = formatting.period;
        time.periodSize = formatting.periodSize || 1;
        time.roundMultiplier = periodDivider[time.period] * time.periodSize;
        formatting.roundMultiplier = time.roundMultiplier;
      }
    }
    return time;
  }

  function updateLevels(time: ChartInternalTime, calendar: ChartCalendar) {
    time.levels = [];
    let index = 0;
    for (const level of calendar.levels) {
      const formatting = level.formats.find(format => +time.zoom <= +format.zoomTo);
      if (level.main) {
        time.format = formatting;
        time.level = index;
      }
      if (formatting) {
        time.levels.push(generatePeriodDates(formatting.period, formatting.periodSize || 1, time));
      }
      index++;
    }
  }

  let working = false;
  function recalculateTimes(reason) {
    if (working) return;
    working = true;
    const configTime = state.get('config.chart.time');
    const chartWidth = state.get('_internal.chart.dimensions.width');
    const calendar = state.get('config.chart.calendar');
    const oldTime = { ...state.get('_internal.chart.time') };

    let time: ChartInternalTime = api.mergeDeep({}, configTime);
    if ((!time.from || !time.to) && !Object.keys(state.get('config.chart.items')).length) {
      return;
    }

    let mainLevel = calendar.levels.find(level => level.main);
    if (!mainLevel) {
      throw new Error('Main calendar level not found (config.chart.calendar.levels).');
    }

    if (!time.calculatedZoomMode) {
      if (time.period !== oldTime.period) {
        let periodFormat = mainLevel.formats.find(format => format.period === time.period && format.default);
        if (periodFormat) {
          time.zoom = periodFormat.zoomTo;
        }
      }
      guessPeriod(time, calendar);
    }

    // If _internal.chart.time (leftGlobal, centerGlobal, rightGlobal, from , to) was changed
    // then we need to apply those values - no recalculation is needed (values form plugins etc)

    const justApply = ['leftGlobal', 'centerGlobal', 'rightGlobal', 'from', 'to'].includes(reason.name);
    if (justApply) {
      time = {
        ...time,
        leftGlobal: configTime.leftGlobal,
        centerGlobal: configTime.centerGlobal,
        rightGlobal: configTime.rightGlobal,
        from: configTime.from,
        to: configTime.to
      };
    }

    let scrollLeft = 0;

    // source of everything = time.timePerPixel
    if (time.calculatedZoomMode && chartWidth) {
      time.finalFrom = time.from;
      time.finalTo = time.to;
      time.totalViewDurationMs = api.time.date(time.finalTo).diff(time.finalFrom, 'milliseconds');
      time.timePerPixel = time.totalViewDurationMs / chartWidth;
      time.zoom = Math.log(time.timePerPixel) / Math.log(2);
      guessPeriod(time, calendar);
      time.totalViewDurationPx = Math.round(time.totalViewDurationMs / time.timePerPixel);
      time.leftGlobal = time.from;
      time.rightGlobal = time.to;
    } else {
      time.timePerPixel = Math.pow(2, time.zoom);
      time = api.time.recalculateFromTo(time);
      time.totalViewDurationMs = api.time.date(time.finalTo).diff(time.finalFrom, 'milliseconds');
      time.totalViewDurationPx = Math.round(time.totalViewDurationMs / time.timePerPixel);
      scrollLeft = state.get('config.scroll.left');
    }

    if (!justApply && !time.calculatedZoomMode) {
      // If time.zoom (or time.period) has been changed
      // then we need to recalculate basing on time.centerGlobal
      // and update scroll left
      // if not then we need to calculate from scroll left
      // because change was triggered by scroll

      if (time.zoom !== oldTime.zoom && oldTime.centerGlobal) {
        const chartWidthInMs = chartWidth * time.timePerPixel;
        const halfChartInMs = Math.round(chartWidthInMs / 2);
        time.leftGlobal = oldTime.centerGlobal - halfChartInMs;
        time.rightGlobal = time.leftGlobal + chartWidthInMs;
        scrollLeft = (time.leftGlobal - time.finalFrom) / time.timePerPixel;
        scrollLeft = api.limitScrollLeft(time.totalViewDurationPx, chartWidth, scrollLeft);
      } else {
        if (state.get('config.scroll.round')) {
          time.leftGlobal =
            Math.round(api.time.date(scrollLeft * time.timePerPixel + time.finalFrom) / time.roundMultiplier) *
            time.roundMultiplier;
        } else {
          time.leftGlobal = scrollLeft * time.timePerPixel + time.finalFrom;
        }
        time.rightGlobal = time.leftGlobal + chartWidth * time.timePerPixel;
      }
    }
    limitGlobalAndSetCenter(time);

    time.leftInner = time.leftGlobal - time.finalFrom;
    time.rightInner = time.rightGlobal - time.finalFrom;
    time.leftPx = time.leftInner / time.timePerPixel;
    time.rightPx = time.rightInner / time.timePerPixel;

    updateLevels(time, calendar);

    let xCompensation = 0;
    if (time.levels[time.level] && time.levels[time.level].length !== 0) {
      xCompensation = time.levels[time.level][0].subPx;
    }

    state.update(`_internal.chart.time`, time);
    state.update('config.scroll.compensation.x', xCompensation);
    state.update('config.chart.time', configTime => {
      configTime.zoom = time.zoom;
      configTime.period = time.format.period;
      configTime.leftGlobal = time.leftGlobal;
      configTime.centerGlobal = time.centerGlobal;
      configTime.rightGlobal = time.rightGlobal;
      configTime.from = time.from;
      configTime.to = time.to;
      configTime.finalFrom = time.finalFrom;
      configTime.finalTo = time.finalTo;
      return configTime;
    });
    state.update('config.scroll.left', scrollLeft);
    update().then(() => {
      if (!state.get('_internal.loaded.time')) {
        state.update('_internal.loaded.time', true);
      }
    });
    working = false;
  }

  const recalculationTriggerCache = {
    initialized: false,
    zoom: 0,
    period: '',
    scrollLeft: 0,
    chartWidth: 0,
    leftGlobal: 0,
    centerGlobal: 0,
    rightGlobal: 0,
    from: 0,
    to: 0
  };
  function recalculationIsNeeded() {
    const configTime = state.get('config.chart.time');
    const scrollLeft = state.get('config.scroll.left');
    const chartWidth = state.get('_internal.chart.dimensions.width');
    const cache = { ...recalculationTriggerCache };
    recalculationTriggerCache.zoom = configTime.zoom;
    recalculationTriggerCache.period = configTime.period;
    recalculationTriggerCache.leftGlobal = configTime.leftGlobal;
    recalculationTriggerCache.centerGlobal = configTime.centerGlobal;
    recalculationTriggerCache.rightGlobal = configTime.rightGlobal;
    recalculationTriggerCache.from = configTime.from;
    recalculationTriggerCache.to = configTime.to;
    recalculationTriggerCache.scrollLeft = scrollLeft;
    recalculationTriggerCache.chartWidth = chartWidth;
    if (!recalculationTriggerCache.initialized) {
      recalculationTriggerCache.initialized = true;
      return { name: 'all' };
    }
    if (configTime.zoom !== cache.zoom) return { name: 'zoom', oldValue: cache.zoom, newValue: configTime.zoom };
    if (configTime.period !== cache.period)
      return { name: 'period', oldValue: cache.period, newValue: configTime.period };
    if (configTime.leftGlobal !== cache.leftGlobal)
      return { name: 'leftGlobal', oldValue: cache.leftGlobal, newValue: configTime.leftGlobal };
    if (configTime.centerGlobal !== cache.centerGlobal)
      return { name: 'centerGlobal', oldValue: cache.centerGlobal, newValue: configTime.centerGlobal };
    if (configTime.rightGlobal !== cache.rightGlobal)
      return { name: 'rightGlobal', oldValue: cache.rightGlobal, newValue: configTime.rightGlobal };
    if (configTime.from !== cache.from) return { name: 'from', oldValue: cache.from, newValue: configTime.from };
    if (configTime.to !== cache.to) return { name: 'to', oldValue: cache.to, newValue: configTime.to };
    if (scrollLeft !== cache.scrollLeft) return { name: 'scroll', oldValue: cache.scrollLeft, newValue: scrollLeft };
    if (chartWidth !== cache.chartWidth)
      return { name: 'chartWidth', oldValue: cache.chartWidth, newValue: chartWidth };
    return false;
  }

  onDestroy(
    state.subscribeAll(
      ['config.chart.time', 'config.chart.calendar.levels', 'config.scroll.left', '_internal.chart.dimensions.width'],
      () => {
        let reason = recalculationIsNeeded();
        if (reason) recalculateTimes(reason);
      },
      { bulk: true }
    )
  );

  // When time.from and time.to is not specified and items are reloaded;
  // check if item is outside current time scope and extend it if needed
  onDestroy(
    state.subscribe(
      'config.chart.items.*.time',
      items => {
        recalculateTimes({ name: 'items' });
      },
      { bulk: true }
    )
  );

  if (state.get('config.usageStatistics') === true && !localStorage.getItem('gstcus')) {
    try {
      fetch('https://gstc-us.neuronet.io/', {
        method: 'POST',
        cache: 'force-cache',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
        body: JSON.stringify({ location: { href: location.href, host: location.host } })
      }).catch(e => {});
      localStorage.setItem('gstcus', 'true');
    } catch (e) {}
  }

  let scrollTop = 0;
  let propagate = true;
  onDestroy(state.subscribe('config.scroll.propagate', prpgt => (propagate = prpgt)));

  /**
   * Handle scroll Event
   * @param {MouseEvent} event
   */
  function handleEvent(event: MouseEvent) {
    if (!propagate) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (event.type === 'scroll') {
      // @ts-ignore
      const top = event.target.scrollTop;
      /**
       * Handle on scroll event
       * @param {object} scroll
       * @returns {object} scroll
       */
      const handleOnScroll = scroll => {
        scroll.top = top;
        scrollTop = scroll.top;
        const scrollInner = state.get('_internal.elements.vertical-scroll-inner');
        if (scrollInner) {
          const scrollHeight = scrollInner.clientHeight;
          scroll.percent.top = scroll.top / scrollHeight;
        }
        return scroll;
      };
      if (scrollTop !== top)
        state.update('config.scroll', handleOnScroll, {
          only: ['top', 'percent.top']
        });
    }
  }

  const onScroll = {
    handleEvent,
    passive: false,
    capture: false
  };

  const dimensions = { width: 0, height: 0 };
  let ro;
  /**
   * Resize action
   * @param {Element} element
   */
  class ResizeAction {
    constructor(element: HTMLElement) {
      if (!ro) {
        ro = new ResizeObserver((entries, observer) => {
          const width = element.clientWidth;
          const height = element.clientHeight;
          if (dimensions.width !== width || dimensions.height !== height) {
            dimensions.width = width;
            dimensions.height = height;
            state.update('_internal.dimensions', dimensions);
          }
        });
        ro.observe(element);
        state.update('_internal.elements.main', element);
      }
    }
    public update() {}
    public destroy(element) {
      ro.unobserve(element);
    }
  }
  if (!componentActions.includes(ResizeAction)) {
    componentActions.push(ResizeAction);
  }

  onDestroy(() => {
    ro.disconnect();
  });

  /**
   * Bind scroll element
   * @param {HTMLElement} element
   */
  function bindScrollElement(element: HTMLElement) {
    if (!verticalScrollBarElement) {
      verticalScrollBarElement = element;
      state.update('_internal.elements.vertical-scroll', element);
    }
  }

  onDestroy(
    state.subscribeAll(['_internal.loaded', '_internal.chart.time.totalViewDurationPx'], () => {
      if (state.get('_internal.loadedEventTriggered')) return;
      const loaded = state.get('_internal.loaded');
      if (loaded.main && loaded.chart && loaded.time && loaded['horizontal-scroll-inner']) {
        const scroll = state.get('_internal.elements.horizontal-scroll-inner');
        const width = state.get('_internal.chart.time.totalViewDurationPx');
        if (scroll && scroll.clientWidth === Math.round(width)) {
          setTimeout(triggerLoadedEvent, 0);
        }
      }
    })
  );

  function LoadedEventAction() {
    state.update('_internal.loaded.main', true);
  }
  if (!componentActions.includes(LoadedEventAction)) componentActions.push(LoadedEventAction);

  /**
   * Bind scroll inner element
   * @param {Element} element
   */
  function bindScrollInnerElement(element: Element) {
    if (!state.get('_internal.elements.vertical-scroll-inner'))
      state.update('_internal.elements.vertical-scroll-inner', element);
    if (!state.get('_internal.loaded.vertical-scroll-inner'))
      state.update('_internal.loaded.vertical-scroll-inner', true);
  }

  const actionProps = { ...props, api, state };
  const mainActions = Actions.create(componentActions, actionProps);
  const verticalScrollActions = Actions.create([bindScrollElement]);
  const verticalScrollAreaActions = Actions.create([bindScrollInnerElement]);

  return templateProps =>
    wrapper(
      html`
        <div
          data-info-url="https://github.com/neuronetio/gantt-schedule-timeline-calendar"
          class=${className}
          style=${styleMap}
          @scroll=${onScroll}
          @wheel=${onScroll}
          data-actions=${mainActions}
        >
          ${List.html()}${Chart.html()}
          <div
            class=${classNameVerticalScroll}
            style=${verticalScrollStyleMap}
            @scroll=${onScroll}
            @wheel=${onScroll}
            data-actions=${verticalScrollActions}
          >
            <div style=${verticalScrollAreaStyleMap} data-actions=${verticalScrollAreaActions} />
          </div>
        </div>
      `,
      { props, vido, templateProps }
    );
}
