import { MapFileService } from './map-file.service';
import { MapEditorDocument } from './map-editor.models';

describe('MapFileService', () => {
  const service = new MapFileService();
  const valid: MapEditorDocument = {
    name: 'Test Arena',
    width: 800,
    height: 600,
    obstacles: [{
      editorId: 'o1',
      type: 'rock',
      assetId: 'rock_block',
      x: 400,
      y: 300,
      width: 64,
      height: 64,
    }],
    spawnPoints: [
      { editorId: 's1', x: 80, y: 80 },
      { editorId: 's2', x: 720, y: 520 },
    ],
  };

  it('round-trips gameplay-compatible JSON without editor IDs', () => {
    const text = service.serialize(valid);
    expect(text).not.toContain('editorId');
    const parsed = service.parse(text);
    expect(parsed.document.name).toBe(valid.name);
    expect(parsed.document.obstacles[0].assetId).toBe('rock_block');
    expect(parsed.document.spawnPoints).toHaveLength(2);
  });

  it('rejects unsupported assets with the obstacle index', () => {
    const json = JSON.stringify({
      name: 'Bad',
      width: 800,
      height: 600,
      spawnPoints: [],
      obstacles: [{ type: 'rock', assetId: 'unknown', x: 1, y: 1, width: 1, height: 1 }],
    });
    expect(() => service.parse(json)).toThrow(/Obstacle 0/);
  });

  it('blocks solid spawn overlap and warns for missing obstacles', () => {
    const issues = service.validate({
      ...valid,
      obstacles: [{ ...valid.obstacles[0], x: 80, y: 80 }],
    });
    expect(issues.some(issue => issue.severity === 'error' && issue.message.includes('Spawn 1 overlaps'))).toBe(true);
  });
});
