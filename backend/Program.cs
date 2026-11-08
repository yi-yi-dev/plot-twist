using System.Net.WebSockets;
using System.Text;
using System.Collections.Concurrent;
using plot_twist_back_end.Core;

namespace plot_twist_back_end;
public static class PlotTwistBackEnd
{
    public static void Main(string[] args) {
        var builder = WebApplication.CreateBuilder(args);
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.Listen(System.Net.IPAddress.Any, 5226);
        });

        // Enable CORS
        var services = builder.Services;
        services.AddCors(options =>
        {
            options.AddPolicy("AllowRequestFromAnyOrigin", policyBuilder =>
            {
                policyBuilder.AllowAnyOrigin() // Allow requests from a frontend served anywhere
                    .AllowAnyHeader()
                    .AllowAnyMethod();
            });
        });

        var app = builder.Build();
        app.UseCors("AllowRequestFromAnyOrigin");
        app.UseHttpsRedirection();
        app.UseWebSockets();

        // Mutable instances so the reset endpoint can replace them
        var wsCoordinator = new WebSocketCoordinator();
        var links = new CrossDataSetLinks(wsCoordinator);
        var selections = new ClientsSelections(wsCoordinator, links);
        var messageHandler = new MessageHandler(selections, links, wsCoordinator);

        // Track active WebSocket objects so we can close them during reset
        var activeSockets = new ConcurrentDictionary<int, WebSocket>();
        var resetLock = new object();

        // Reset endpoint: closes active sockets (best-effort) and re-instantiates the 4 classes.
        app.MapPost("/reset", async (HttpContext context) =>
        {
            lock (resetLock)
            {
                // Close all tracked WebSockets (best-effort)
                var sockets = activeSockets.Values.ToList();
                foreach (var ws in sockets)
                {
                    try
                    {
                        if (ws.State == WebSocketState.Open)
                        {
                            // Synchronously await is not allowed inside lock, so schedule close tasks to run after releasing the lock.
                        }
                    }
                    catch
                    {
                        // ignore
                    }
                }
            }

            // Recreate core instances first so clients reconnecting after the close reach the fresh state
            var socketsToClose = activeSockets.Values.ToList();
            lock (resetLock)
            {
                activeSockets.Clear();

                wsCoordinator = new WebSocketCoordinator();
                links = new CrossDataSetLinks(wsCoordinator);
                selections = new ClientsSelections(wsCoordinator, links);
                messageHandler = new MessageHandler(selections, links, wsCoordinator);
            }

            foreach (var ws in socketsToClose)
            {
                try
                {
                    if (ws.State == WebSocketState.Open)
                        ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Server reset", CancellationToken.None).GetAwaiter().GetResult();
                }
                catch
                {
                    // ignore
                }
            }

            context.Response.StatusCode = 200;
            await context.Response.WriteAsync("Reset completed");
        });

        // WebSocket request handling
        app.Use(async (HttpContext context, RequestDelegate next) =>
        {
            if (context.WebSockets.IsWebSocketRequest)
            {
                using var webSocket = await context.WebSockets.AcceptWebSocketAsync(
                    new WebSocketAcceptContext { DangerousEnableCompression = true });
                await HandleWebSocketCommunication(webSocket, messageHandler, activeSockets);
            }
            else
            {
                await next(context);
            }
        });

        app.Run();
    }

    private static async Task HandleWebSocketCommunication(WebSocket webSocket, MessageHandler messageHandler, ConcurrentDictionary<int, WebSocket> activeSockets)
    {
        int socketId = messageHandler.wsCoordinator.AddWebSocket(webSocket);
        Console.WriteLine($"New WebSocket connection with id: {socketId}");

        // Track this WebSocket so reset endpoint can close it
        activeSockets.TryAdd(socketId, webSocket);

        try
        {
            while (webSocket.State == WebSocketState.Open)
            {
                WebSocketReceiveResult result;
                using var ms = new MemoryStream();
                var buffer = new byte[4 * 1024];

                try
                {
                    // Accumulate fragmented frames
                    do
                    {
                        result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

                        if (result.CloseStatus.HasValue)
                        {
                            await webSocket.CloseAsync(result.CloseStatus.Value, result.CloseStatusDescription, CancellationToken.None);
                            return;
                        }

                        ms.Write(buffer, 0, result.Count);
                    }
                    while (!result.EndOfMessage);
                }
                catch (WebSocketException)
                {
                    // Client disconnected unexpectedly
                    break;
                }

                // Decode complete JSON text
                ms.Seek(0, SeekOrigin.Begin);
                string json = Encoding.UTF8.GetString(ms.ToArray());
                await messageHandler.HandleMessage(json, socketId);
            }
        }
        finally
        {
            try
            {
                if (webSocket.State != WebSocketState.Closed && webSocket.State != WebSocketState.Aborted)
                    await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
            }
            catch (WebSocketException)
            {
                Console.WriteLine($"Connection {socketId} closed unexpectedly.");
            }
            finally
            {
                // Clean up using the messageHandler instance that was handling this connection
                messageHandler.wsCoordinator.RemoveWebSocket(socketId);
                messageHandler.selections.CleanClientSelection(socketId);
                messageHandler.links.updateCrossDataSetSelection();
                messageHandler.selections.ThrottledBroadcastClientsSelections(0);
                messageHandler.selections.RemoveClient(socketId);
                Console.WriteLine($"WebSocket with id {socketId} closed");

                // Remove from our tracking dictionary
                activeSockets.TryRemove(socketId, out _);
            }
        }
    }
}
