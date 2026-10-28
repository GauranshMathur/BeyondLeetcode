# Kubernetes and asyncio: timers that change or go away

Timers get cancelled and rescheduled. A heap can hand you its smallest item in O(1) in the **worst case** but it cannot find an item in the middle. Systems solve that in two opposite ways. This Chapter reads the Kubernetes 1.31.0 scheduler, the Python 3.13.0 `asyncio` event loop and the Go 1.22.0 runtime. In the Problems you build both ways.

## Kubernetes: write down where everything is

The scheduler keeps the pods that wait for a place in queues, and the file describes two of them: "activeQ holds pods that are being considered for scheduling." "backoffQ holds pods that moved from unschedulablePods and will move to activeQ when their backoff periods complete." ([pkg/scheduler/internal/queue/scheduling_queue.go, lines 21 to 23](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/queue/scheduling_queue.go#L21-L23)) The backoff queue is a heap that is built with a comparison function of its own:

```go
pq.podBackoffQ = heap.NewWithRecorder(podInfoKeyFunc, pq.podsCompareBackoffCompleted, metrics.NewBackoffPodsRecorder())
```

([pkg/scheduler/internal/queue/scheduling_queue.go, line 409](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/queue/scheduling_queue.go#L409)) The function orders pods by the time their backoff ends:

```go
func (p *PriorityQueue) podsCompareBackoffCompleted(podInfo1, podInfo2 interface{}) bool {
	pInfo1 := podInfo1.(*framework.QueuedPodInfo)
	pInfo2 := podInfo2.(*framework.QueuedPodInfo)
	bo1 := p.getBackoffTime(pInfo1)
	bo2 := p.getBackoffTime(pInfo2)
	return bo1.Before(bo2)
}
```

([pkg/scheduler/internal/queue/scheduling_queue.go, lines 1472 to 1478](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/queue/scheduling_queue.go#L1472-L1478)) A function moves the pods whose backoff is over into the active queue. It looks at the head, stops if the head is still waiting, and otherwise pops it:

```go
// flushBackoffQCompleted Moves all pods from backoffQ which have completed backoff in to activeQ
func (p *PriorityQueue) flushBackoffQCompleted(logger klog.Logger) {
	p.lock.Lock()
	defer p.lock.Unlock()
	activated := false
	for {
		rawPodInfo := p.podBackoffQ.Peek()
		if rawPodInfo == nil {
			break
		}
		pInfo := rawPodInfo.(*framework.QueuedPodInfo)
		pod := pInfo.Pod
		if p.isPodBackingoff(pInfo) {
			break
		}
		_, err := p.podBackoffQ.Pop()
		if err != nil {
			logger.Error(err, "Unable to pop pod from backoff queue despite backoff completion", "pod", klog.KObj(pod))
			break
		}
		if added, _ := p.moveToActiveQ(logger, pInfo, framework.BackoffComplete); added {
			activated = true
		}
	}

	if activated {
		p.cond.Broadcast()
	}
}
```

([pkg/scheduler/internal/queue/scheduling_queue.go, lines 889 to 917](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/queue/scheduling_queue.go#L889-L917)) That is your `advance` again. What is new is that pods change while they wait, so the heap type remembers where each one is. Its comment says: "items is a map from key of the objects to the objects and their index." ([pkg/scheduler/internal/heap/heap.go, lines 47 to 48](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/heap/heap.go#L47-L48)) Its `Swap` writes the new index of both items every time two items trade places:

```go
func (h *data) Swap(i, j int) {
	h.queue[i], h.queue[j] = h.queue[j], h.queue[i]
	item := h.items[h.queue[i]]
	item.index = i
	item = h.items[h.queue[j]]
	item.index = j
}
```

([pkg/scheduler/internal/heap/heap.go, lines 88 to 94](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/heap/heap.go#L88-L94)) With the index known, changing an item is a `Fix` and removing one is a `Remove`, the two functions of `container/heap` from Chapter 2:

```go
func (h *Heap) Add(obj interface{}) error {
	key, err := h.data.keyFunc(obj)
	if err != nil {
		return cache.KeyError{Obj: obj, Err: err}
	}
	if _, exists := h.data.items[key]; exists {
		h.data.items[key].obj = obj
		heap.Fix(h.data, h.data.items[key].index)
	} else {
		heap.Push(h.data, &itemKeyValue{key, obj})
		if h.metricRecorder != nil {
			h.metricRecorder.Inc()
		}
	}
	return nil
}
```

([pkg/scheduler/internal/heap/heap.go, lines 138 to 153](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/heap/heap.go#L138-L153))

```go
func (h *Heap) Delete(obj interface{}) error {
	key, err := h.data.keyFunc(obj)
	if err != nil {
		return cache.KeyError{Obj: obj, Err: err}
	}
	if item, ok := h.data.items[key]; ok {
		heap.Remove(h.data, item.index)
		if h.metricRecorder != nil {
			h.metricRecorder.Dec()
		}
		return nil
	}
	return fmt.Errorf("object not found")
}
```

([pkg/scheduler/internal/heap/heap.go, lines 162 to 175](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/heap/heap.go#L162-L175)) The Go documentation says what `Fix` is for and what it costs: "Changing the value of the element at index i and then calling Fix is equivalent to, but less expensive than, calling Remove(h, i) followed by a Push of the new value. The complexity is O(log n) where n = h.Len()." ([src/container/heap/heap.go, lines 79 to 81](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L79-L81)) And for `Remove`: "Remove removes and returns the element at index i from the heap. The complexity is O(log n) where n = h.Len()." ([src/container/heap/heap.go, lines 66 to 67](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/container/heap/heap.go#L66-L67))

Updating or cancelling a timer is therefore O(log n) comparisons in the **worst case**, and finding it is a map lookup, O(1) **expected**. The price is a second structure that must always agree with the first, which the source states as a rule it depends on: "We depend on the property that items in the map are in the queue and vice versa." ([pkg/scheduler/internal/heap/heap.go, lines 47 to 48](https://github.com/kubernetes/kubernetes/blob/9edcffcde5595e8a5b1a35f88c421764e575afce/pkg/scheduler/internal/heap/heap.go#L47-L48)) libuv pays differently: `uv_timer_start` stops a running timer and starts it again with a new `start_id` ([src/timer.c, lines 68 to 95](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/timer.c#L68-L95)), so a restarted timer goes to the back of its ties (reading those lines). Your `update` keeps the ticket, as the Kubernetes `Fix` keeps the item.

## asyncio: mark it and move on

asyncio's event loop takes the other road. Its timers sit in a plain `heapq` list, and nothing in the code below records where a handle is:

```python
heapq.heappush(self._scheduled, timer)
timer._scheduled = True
return timer
```

([Lib/asyncio/base_events.py, lines 815 to 817](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/asyncio/base_events.py#L815-L817)) Cancelling one only marks it and counts it:

```python
def _timer_handle_cancelled(self, handle):
    """Notification that a TimerHandle has been cancelled."""
    if handle._scheduled:
        self._timer_cancelled_count += 1
```

([Lib/asyncio/base_events.py, lines 1942 to 1945](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/asyncio/base_events.py#L1942-L1945)) The handle stays in the list. That is the way the `heapq` documentation suggests: "Removing the entry or changing its priority is more difficult because it would break the heap structure invariants. So, a possible solution is to mark the entry as removed and add a new entry with the revised priority" ([heapq documentation, Priority Queue Implementation Notes](https://docs.python.org/3.13/library/heapq.html#priority-queue-implementation-notes)) The Go runtime also marks: "deltimer deletes the timer t. It may be on some other P, so we can't actually remove it from the timers heap. We can only mark it as deleted. It will be removed in due course by the P whose heap it is on." ([src/runtime/time.go, lines 310 to 312](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L310-L312))

Marked entries have to go sometime. asyncio cleans up at the start of `_run_once`, and its thresholds are two constants:

```python
# Minimum number of _scheduled timer handles before cleanup of
# cancelled handles is performed.
_MIN_SCHEDULED_TIMER_HANDLES = 100

# Minimum fraction of _scheduled timer handles that are cancelled
# before cleanup of cancelled handles is performed.
_MIN_CANCELLED_TIMER_HANDLES_FRACTION = 0.5
```

([Lib/asyncio/base_events.py, lines 57 to 63](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/asyncio/base_events.py#L57-L63)) The clean-up uses them:

```python
sched_count = len(self._scheduled)
if (sched_count > _MIN_SCHEDULED_TIMER_HANDLES and
    self._timer_cancelled_count / sched_count >
        _MIN_CANCELLED_TIMER_HANDLES_FRACTION):
    # Remove delayed calls that were cancelled if their number
    # is too high
    new_scheduled = []
    for handle in self._scheduled:
        if handle._cancelled:
            handle._scheduled = False
        else:
            new_scheduled.append(handle)

    heapq.heapify(new_scheduled)
    self._scheduled = new_scheduled
    self._timer_cancelled_count = 0
else:
    # Remove delayed calls that were cancelled from head of queue.
    while self._scheduled and self._scheduled[0]._cancelled:
        self._timer_cancelled_count -= 1
        handle = heapq.heappop(self._scheduled)
        handle._scheduled = False
```

([Lib/asyncio/base_events.py, lines 1955 to 1976](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/asyncio/base_events.py#L1955-L1976)) With more than 100 timers and more than half of them cancelled, it throws the cancelled ones away and calls `heapify` on what is left. Otherwise it only pops the cancelled handles that sit at the head. The loop then pops every due handle, cancelled or not:

```python
end_time = self.time() + self._clock_resolution
while self._scheduled:
    handle = self._scheduled[0]
    if handle._when >= end_time:
        break
    handle = heapq.heappop(self._scheduled)
    handle._scheduled = False
    self._ready.append(handle)
```

([Lib/asyncio/base_events.py, lines 1995 to 2002](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/asyncio/base_events.py#L1995-L2002)) The cancelled ones are skipped when their turn to run comes:

```python
ntodo = len(self._ready)
for i in range(ntodo):
    handle = self._ready.popleft()
    if handle._cancelled:
        continue
```

([Lib/asyncio/base_events.py, lines 2010 to 2014](https://github.com/python/cpython/blob/60403a5409ff2c3f3b07dd2ca91a7a3e096839c7/Lib/asyncio/base_events.py#L2010-L2014)) Go does the same kind of head clean-up: "cleantimers cleans up the head of the timer queue. This speeds up programs that create and delete timers; leaving them in the heap slows down addtimer." ([src/runtime/time.go, lines 558 to 560](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L558-L560)) And it also sweeps the whole heap: "clearDeletedTimers removes all deleted timers from the P's timer heap. This is used to avoid clogging up the heap if the program starts a lot of long-running timers and then stops them." ([src/runtime/time.go, lines 895 to 897](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L895-L897))

What marking costs, with `n` entries in the array: cancelling is O(1) in the **worst case**, one flag. A rebuild is O(n), but it only runs when more than half of more than 100 entries are cancelled, so the O(n) is paid for by more than n / 2 cancellations before it: O(1) **amortised** per cancel. Each cancelled entry that is popped later costs O(log n) in the **worst case** like any pop. The price is memory and a longer heap: cancelled entries stay until a clean-up reaches them.

## What the Problems build

Problem 6 adds `update ID T` and `cancel ID` the Kubernetes way: every item knows its index, a map takes IDs to items, and both commands fix the heap in O(log n) comparisons in the **worst case**. Problem 7 adds `drop ID` the asyncio way: mark it, leave it in the array, and let the clean-up at the start of `advance` remove it by the same two rules.
