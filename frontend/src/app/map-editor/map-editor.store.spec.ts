import { MapEditorStore } from './map-editor.store';

describe('MapEditorStore', () => {
  it('adds, duplicates, deletes, and restores obstacles', () => {
    const store = new MapEditorStore();
    const obstacle = store.addObstacle('rock_block', 100, 100);
    expect(obstacle).toBeTruthy();
    store.duplicateSelection();
    expect(store.document().obstacles).toHaveLength(2);
    store.deleteSelection();
    expect(store.document().obstacles).toHaveLength(1);
    store.undo();
    expect(store.document().obstacles).toHaveLength(2);
  });

  it('coalesces a drag transaction into one undo step', () => {
    const store = new MapEditorStore();
    const obstacle = store.addObstacle('rock_block', 100, 100)!;
    store.setSelection([{ kind: 'obstacle', id: obstacle.editorId }]);
    store.beginTransaction();
    store.moveSelection(10, 0);
    store.moveSelection(10, 0);
    store.finishTransaction();
    expect(store.document().obstacles[0].x).toBe(116);
    store.undo();
    expect(store.document().obstacles[0].x).toBe(96);
  });

  it('moves from the original drag position without losing small snapped movements', () => {
    const store = new MapEditorStore();
    const obstacle = store.addObstacle('rock_block', 100, 100)!;
    const origins = [{ id: obstacle.editorId, x: obstacle.x, y: obstacle.y }];

    store.moveEntitiesFrom(origins, [], 5, 0, true);
    expect(store.document().obstacles[0].x).toBe(96);

    store.moveEntitiesFrom(origins, [], 9, 0, true);
    expect(store.document().obstacles[0].x).toBe(112);
  });
});
