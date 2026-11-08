using plot_twist_back_end.Messages;

// Bounded queue that preserves the last item when full.
// Thread-safe for multiple producers and a single consumer.
public class BoundedPreserveLastQueue : IDisposable
{
    private readonly LinkedList<Message> _list = new();
    private readonly int _capacity;
    private readonly object _lock = new();
    private readonly SemaphoreSlim _items = new(0);
    private bool _completed = false;
    private bool _disposed = false;

    public BoundedPreserveLastQueue(int capacity)
    {
        _capacity = capacity;
    }

    public bool EnqueuePreserveLast(Message msg)
    {
        lock (_lock)
        {
            if (_completed || _disposed) return false;

            if (_list.Count < _capacity)
            {
                _list.AddLast(msg);
                try
                {
                    _items.Release();
                }
                catch (ObjectDisposedException)
                {
                    // race with Dispose()
                    return false;
                }
                return true;
            }

            // when full evict oldest selection(s) until there's room.
            while (_list.Count >= _capacity)
            {
                // remove oldest
                _list.RemoveFirst();
                try
                {
                    _items.Wait(0);
                }
                catch
                {
                    // ignore disposal or other races
                }
            }

            // append the new (most recent) selection
            _list.AddLast(msg);
            try
            {
                _items.Release();
            }
            catch (ObjectDisposedException)
            {
                return false;
            }
            return true;
        }
    }

    public async Task<Message?> DequeueAsync()
    {
        while (true)
        {
            try
            {
                await _items.WaitAsync().ConfigureAwait(false);
            }
            catch (ObjectDisposedException)
            {
                // If disposed while waiting, it is completed/empty.
                return null;
            }

            lock (_lock)
            {
                if (_list.Count > 0)
                {
                    var val = _list.First!.Value;
                    _list.RemoveFirst();
                    return val;
                }

                if (_completed)
                {
                    // completed and no items left
                    return null;
                }
            }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try
        {
            _items.Dispose();
        }
        catch
        {
            // swallow exceptions
        }
        lock (_lock) _list.Clear();
    }
}

