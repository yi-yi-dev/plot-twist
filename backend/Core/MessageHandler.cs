using System.Collections.Concurrent;
using System.Text.Json;
using plot_twist_back_end.Messages;

namespace plot_twist_back_end.Core
{
    public class MessageHandler
    {
        public ClientsSelections selections { get; }
        public CrossDataSetLinks links { get; }
        public WebSocketCoordinator wsCoordinator { get; }

        // One global gate: only one message execution at a time.
        private readonly SemaphoreSlim _messageGate = new(1, 1);

        // Per-socket selection queues.
        private readonly ConcurrentDictionary<int, BoundedPreserveLastQueue> _selectionQueues = new();
        private readonly ConcurrentDictionary<int, Task> _processingTasks = new();

        private const int QueueCapacity = 2;

        public MessageHandler(
            ClientsSelections selections,
            CrossDataSetLinks links,
            WebSocketCoordinator wsCoordinator)
        {
            this.selections = selections;
            this.links = links;
            this.wsCoordinator = wsCoordinator;
        }

        public async Task HandleMessage(string message, int socketId)
        {
            var clientMessage = JsonSerializer.Deserialize<Message>(message);
            if (string.IsNullOrWhiteSpace(clientMessage.type))
                return;

            switch (clientMessage.type)
            {
                case "selection":
                {
                    // The actual selection application is locked later in the consumer.
                    if (_selectionQueues.TryGetValue(socketId, out var queue))
                    {
                        queue.EnqueuePreserveLast(clientMessage);
                    }

                    break;
                }

                case "link":
                    await ExecuteUnderGateAsync(() =>
                    {
                        links.UpdateClientsLinks(clientMessage.links!, clientMessage.linksOperator!);
                        links.updateCrossDataSetSelection();
                        links.broadcastClientsLinks(socketId);
                        selections.ThrottledBroadcastClientsSelections(0);
                        return Task.CompletedTask;
                    });
                    break;

                case "addClient":
                    await ExecuteUnderGateAsync(() =>
                    {
                        wsCoordinator.InitializeClient(socketId);
                        selections.AddClient(socketId);

                        var q = new BoundedPreserveLastQueue(QueueCapacity);

                        // Store queue first so selection messages can find it.
                        _selectionQueues.TryAdd(socketId, q);

                        // Start one consumer per socket.
                        var task = Task.Run(() => ProcessSelectionQueueAsync(socketId, q));
                        _processingTasks.TryAdd(socketId, task);

                        links.broadcastClientsLinks();
                        selections.ThrottledBroadcastClientsSelections(0);

                        return Task.CompletedTask;
                    });
                    break;

                case "addDataSet":
                    await ExecuteUnderGateAsync(() =>
                    {
                        links.AddDataset(clientMessage.dataSet![0]);
                        links.broadcastClientsLinks();
                        return Task.CompletedTask;
                    });
                    break;
            }
        }

        private async Task ExecuteUnderGateAsync(Func<Task> action)
        {
            await _messageGate.WaitAsync().ConfigureAwait(false);
            try
            {
                await action().ConfigureAwait(false);
            }
            finally
            {
                _messageGate.Release();
            }
        }

        private async Task ProcessSelectionQueueAsync(int socketId, BoundedPreserveLastQueue queue)
        {
            try
            {
                while (true)
                {
                    var msg = await queue.DequeueAsync().ConfigureAwait(false);
                    if (msg is null)
                        return;

                    // Lock only when the selection is actually being applied.
                    await ExecuteUnderGateAsync(() =>
                    {
                        selections.UpdateClientSelection(socketId, msg.Value.clientsSelections![0]);
                        links.updateCrossDataSetSelection();
                        selections.ThrottledBroadcastClientsSelections(0);
                        return Task.CompletedTask;
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Exception in selection processor for socket {socketId}: {ex}");
            }
        }
    }
}