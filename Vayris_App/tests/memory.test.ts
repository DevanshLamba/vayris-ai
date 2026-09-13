import { SQLiteMemoryStore } from '../src/memory/store';

describe('SQLiteMemoryStore', () => {
  let store: SQLiteMemoryStore;

  beforeEach(() => {
    // Use an in-memory database for testing so it's clean and doesn't write to disk
    store = new SQLiteMemoryStore(':memory:');
  });

  afterEach(async () => {
    await store.close();
  });

  it('should save and retrieve a memory', async () => {
    const record = await store.save('User prefers dark mode', 'preference', { source: 'chat' });
    expect(record.id).toBeDefined();
    expect(record.content).toBe('User prefers dark mode');

    const fetched = await store.get(record.id);
    expect(fetched).toBeDefined();
    expect(fetched?.content).toBe('User prefers dark mode');
    expect(fetched?.metadata?.source).toBe('chat');
  });

  it('should return null for unknown id', async () => {
    const fetched = await store.get('unknown-id');
    expect(fetched).toBeNull();
  });

  it('should search memories by content', async () => {
    await store.save('The project is called Vayris', 'fact');
    await store.save('The sky is blue', 'fact');
    
    const results = await store.search('Vayris');
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('Vayris');
  });

  it('should filter search by category', async () => {
    await store.save('Likes pizza', 'preference');
    await store.save('Likes coding', 'preference');
    await store.save('Likes pizza', 'fact');

    const results = await store.search('pizza', 'preference');
    expect(results.length).toBe(1);
    expect(results[0].category).toBe('preference');
  });

  it('should delete a memory', async () => {
    const record = await store.save('To be deleted', 'fact');
    const wasDeleted = await store.delete(record.id);
    expect(wasDeleted).toBe(true);

    const fetched = await store.get(record.id);
    expect(fetched).toBeNull();
  });

  it('should clear all memories', async () => {
    await store.save('Fact 1', 'fact');
    await store.save('Fact 2', 'fact');
    await store.clear();

    const results = await store.search('Fact');
    expect(results.length).toBe(0);
  });
});
