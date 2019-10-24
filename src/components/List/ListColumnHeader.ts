/**
 * ListColumnHeader component
 *
 * @copyright Rafal Pospiech <https://neuronet.io>
 * @author    Rafal Pospiech <neuronet.io@gmail.com>
 * @package   gantt-schedule-timeline-calendar
 * @license   GPL-3.0
 */

export default function ListColumnHeader(vido, { columnId }) {
  const { api, state, onDestroy, actions, update, createComponent, html } = vido;

  let wrapper;
  onDestroy(state.subscribe('config.wrappers.ListColumnHeader', value => (wrapper = value)));

  const componentName = 'list-column-header';
  const componentActions = api.getActions(componentName);

  let ListColumnHeaderResizerComponent;
  onDestroy(
    state.subscribe('config.components.ListColumnHeaderResizer', value => (ListColumnHeaderResizerComponent = value))
  );
  const ListColumnHeaderResizer = createComponent(ListColumnHeaderResizerComponent, { columnId });
  onDestroy(ListColumnHeaderResizer.destroy);

  let ListExpanderComponent;
  onDestroy(state.subscribe('config.components.ListExpander', value => (ListExpanderComponent = value)));
  const ListExpander = createComponent(ListExpanderComponent, {});
  onDestroy(ListExpander.destroy);

  let column;
  onDestroy(
    state.subscribe(`config.list.columns.data.${columnId}`, val => {
      column = val;
      update();
    })
  );

  let className, contentClass, style;
  onDestroy(
    state.subscribeAll(['config.classNames', 'config.headerHeight'], () => {
      const value = state.get('config');
      className = api.getClass(componentName, { column });
      contentClass = api.getClass(componentName + '-content', { column });
      style = `--height: ${value.headerHeight}px;`;
      update();
    })
  );

  function withExpander() {
    return html`
      <div class=${contentClass}>
        ${ListExpander.html()}${ListColumnHeaderResizer.html(column)}
      </div>
    `;
  }

  function withoutExpander() {
    return html`
      <div class=${contentClass}>
        ${ListColumnHeaderResizer.html(column)}
      </div>
    `;
  }

  return props =>
    wrapper(
      html`
        <div class=${className} style=${style} data-actions=${actions(componentActions, { column, api, state })}>
          ${typeof column.expander === 'boolean' && column.expander ? withExpander() : withoutExpander()}
        </div>
      `,
      { vido, props: { columnId }, templateProps: props }
    );
}
