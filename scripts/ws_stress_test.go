package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	tunnelToken = "lx_tunnel_stress_test_1781799794"
	sigServer   = "wss://lingxi-singaling-server.onrender.com"
)

func tunnelWSURL(path string) string {
	return fmt.Sprintf("%s/tunnel/%s%s", sigServer, tunnelToken, path)
}

func tunnelHTTPURL(path string) string {
	return fmt.Sprintf("https://lingxi-singaling-server.onrender.com/tunnel/%s%s", tunnelToken, path)
}

// Test 1: HTTP over tunnel — basic connectivity
func testHTTPTunnel() {
	fmt.Println("\n=== Test 1: HTTP over Tunnel ===")
	start := time.Now()
	resp, err := http.Get(tunnelHTTPURL("/api/health"))
	if err != nil {
		fmt.Printf("  FAIL: %v\n", err)
		return
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	fmt.Printf("  PASS: status=%d, data=%v, latency=%v\n", resp.StatusCode, result, time.Since(start))
}

// Test 2: WS over tunnel — connect + subscribe + receive events
func testWSTunnel() {
	fmt.Println("\n=== Test 2: WS over Tunnel (subscribe + wait 10s) ===")
	wsURL := tunnelWSURL("/api/ws")
	fmt.Printf("  Connecting to: %s\n", wsURL)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Printf("  FAIL connect: %v\n", err)
		return
	}
	defer conn.Close()
	fmt.Println("  Connected!")

	// Subscribe to session 0 (global events)
	subMsg := map[string]interface{}{"type": "subscribe", "sessionId": 0}
	if err := conn.WriteJSON(subMsg); err != nil {
		fmt.Printf("  FAIL subscribe: %v\n", err)
		return
	}

	msgCount := 0
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			msgCount++
			if msgCount <= 3 {
				preview := string(msg)
			if len(preview) > 100 {
				preview = preview[:100]
			}
			fmt.Printf("  Received msg #%d: %s\n", msgCount, preview)
			}
		}
	}()

	time.Sleep(10 * time.Second)
	conn.Close()
	<-done
	fmt.Printf("  PASS: received %d messages in 10s\n", msgCount)
}

// Test 3: Long-lived WS — maintain for 2 minutes, check for drops
func testWSLongLived() {
	fmt.Println("\n=== Test 3: Long-lived WS (2 min keepalive) ===")
	wsURL := tunnelWSURL("/api/ws")

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Printf("  FAIL connect: %v\n", err)
		return
	}
	defer conn.Close()

	// Set up pong handler
	conn.SetPongHandler(func(string) error {
		return nil
	})

	var lastPingAt time.Time
	var pingCount int32

	// Read loop
	done := make(chan struct{})
	var readErr error
	go func() {
		defer close(done)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				readErr = err
				return
			}
		}
	}()

	// Ping loop — send WS pings every 15s
	pingTicker := time.NewTicker(15 * time.Second)
	defer pingTicker.Stop()

	// Status ticker
	statusTicker := time.NewTicker(30 * time.Second)
	defer statusTicker.Stop()

	timeout := time.After(2 * time.Minute)
	startTime := time.Now()

	// Also send application-level keepalive
	appPingTicker := time.NewTicker(20 * time.Second)
	defer appPingTicker.Stop()

	for {
		select {
		case <-timeout:
			duration := time.Since(startTime)
			fmt.Printf("  PASS: WS alive for %v, pings=%d\n", duration, atomic.LoadInt32(&pingCount))
			return
		case <-done:
			duration := time.Since(startTime)
			fmt.Printf("  FAIL: WS dropped after %v, err=%v\n", duration, readErr)
			return
		case <-pingTicker.C:
			lastPingAt = time.Now()
			_ = lastPingAt
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				fmt.Printf("  WARN: ping write failed: %v\n", err)
			}
			atomic.AddInt32(&pingCount, 1)
		case <-appPingTicker.C:
			// Application-level keepalive (JSON subscribe)
			keepalive := map[string]interface{}{"type": "subscribe", "sessionId": 0}
			if err := conn.WriteJSON(keepalive); err != nil {
				fmt.Printf("  WARN: app keepalive failed: %v\n", err)
			}
		case <-statusTicker.C:
			elapsed := time.Since(startTime)
			fmt.Printf("  ... alive for %v, pings=%d\n", elapsed, atomic.LoadInt32(&pingCount))
		}
	}
}

// Test 4: Concurrent WS connections (simulate multiple tabs/pages)
func testWSConcurrent() {
	fmt.Println("\n=== Test 4: Concurrent WS (5 connections, 30s) ===")
	wsURL := tunnelWSURL("/api/ws")

	var wg sync.WaitGroup
	results := make([]string, 5)

	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
			if err != nil {
				results[idx] = fmt.Sprintf("conn#%d: FAIL connect: %v", idx, err)
				return
			}
			defer conn.Close()

			// Subscribe
			conn.WriteJSON(map[string]interface{}{"type": "subscribe", "sessionId": 0})

			// Keep alive for 30s
			done := make(chan error, 1)
			go func() {
				for {
					_, _, err := conn.ReadMessage()
					if err != nil {
						done <- err
						return
					}
				}
			}()

			select {
			case err := <-done:
				results[idx] = fmt.Sprintf("conn#%d: DROPPED after start: %v", idx, err)
			case <-time.After(30 * time.Second):
				results[idx] = fmt.Sprintf("conn#%d: PASS (alive 30s)", idx)
			}
		}(i)
	}

	wg.Wait()
	for _, r := range results {
		fmt.Printf("  %s\n", r)
	}
}

// Test 5: HTTP burst — 20 rapid sequential requests
func testHTTPBurst() {
	fmt.Println("\n=== Test 5: HTTP Burst (20 rapid requests) ===")
	success := 0
	totalLatency := time.Duration(0)

	for i := 0; i < 20; i++ {
		start := time.Now()
		resp, err := http.Get(tunnelHTTPURL("/api/ping"))
		latency := time.Since(start)
		if err != nil {
			fmt.Printf("  req#%d FAIL: %v\n", i, err)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == 200 {
			success++
			totalLatency += latency
		} else {
			fmt.Printf("  req#%d HTTP %d\n", i, resp.StatusCode)
		}
	}

	avgLatency := time.Duration(0)
	if success > 0 {
		avgLatency = totalLatency / time.Duration(success)
	}
	fmt.Printf("  Result: %d/20 success, avg latency=%v\n", success, avgLatency)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	fmt.Println("╔══════════════════════════════════════╗")
	fmt.Println("║  WS over Tunnel Stress Test          ║")
	fmt.Printf("║  Tunnel: %s  ║\n", tunnelToken[:30]+"...")
	fmt.Println("╚══════════════════════════════════════╝")

	// Skip long tests if --quick flag
	quick := false
	for _, arg := range os.Args[1:] {
		if arg == "--quick" {
			quick = true
		}
	}

	testHTTPTunnel()
	testHTTPBurst()

	if quick {
		fmt.Println("\n=== Quick mode: skipping long WS tests ===")
		testWSTunnel()
	} else {
		testWSTunnel()
		testWSConcurrent()
		testWSLongLived()
	}

	fmt.Println("\n=== All tests complete ===")
}
