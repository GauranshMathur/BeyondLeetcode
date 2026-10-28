# libuv and Go: which timer fires next

Every event loop has to answer one question before it sleeps: when is the next timer due? Three real systems answer it with three structures. This Chapter reads libuv 1.48.0, the timers of the Go 1.22.0 runtime, and nginx 1.26.2. In the Problems you build the queue they all need: schedule a timer, and fire the ones that are due, in order.

## libuv: a binary heap, ties by start order

libuv keeps its timers in a heap, and its header describes it: "A binary min heap. The usual properties hold: the root is the lowest element in the set, the height of the tree is at most log2(nodes) and it's always a complete binary tree." ([src/heap-inl.h, lines 33 to 35](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/heap-inl.h#L33-L35)) It is not an array like the one in `heapq`. Each node holds three pointers:

```c
struct heap_node {
  struct heap_node* left;
  struct heap_node* right;
  struct heap_node* parent;
};
```

([src/heap-inl.h, lines 27 to 31](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/heap-inl.h#L27-L31)) The ordering is a function that returns true when timer `a` comes before timer `b`:

```c
static int timer_less_than(const struct heap_node* ha,
                           const struct heap_node* hb) {
  const uv_timer_t* a;
  const uv_timer_t* b;

  a = container_of(ha, uv_timer_t, node.heap);
  b = container_of(hb, uv_timer_t, node.heap);

  if (a->timeout < b->timeout)
    return 1;
  if (b->timeout < a->timeout)
    return 0;

  /* Compare start_id when both have the same timeout. start_id is
   * allocated with loop->timer_counter in uv_timer_start().
   */
  return a->start_id < b->start_id;
}
```

([src/timer.c, lines 38 to 55](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/timer.c#L38-L55)) The timeout decides, and when two timers have the same timeout the second key decides. The source says what it is: "start_id is the second index to be compared in timer_less_than()" ([src/timer.c, line 86](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/timer.c#L86)) So timers with equal timeouts are ordered by `start_id`, the number of timers started before. That is your **ticket**, and it is why every correct heap fires equal timers in the same order. Here is where the number comes from, in `uv_timer_start`:

```c
int uv_timer_start(uv_timer_t* handle,
                   uv_timer_cb cb,
                   uint64_t timeout,
                   uint64_t repeat) {
  uint64_t clamped_timeout;

  if (uv__is_closing(handle) || cb == NULL)
    return UV_EINVAL;

  uv_timer_stop(handle);

  clamped_timeout = handle->loop->time + timeout;
  if (clamped_timeout < timeout)
    clamped_timeout = (uint64_t) -1;

  handle->timer_cb = cb;
  handle->timeout = clamped_timeout;
  handle->repeat = repeat;
  /* start_id is the second index to be compared in timer_less_than() */
  handle->start_id = handle->loop->timer_counter++;

  heap_insert(timer_heap(handle->loop),
              (struct heap_node*) &handle->node.heap,
              timer_less_than);
  uv__handle_start(handle);

  return 0;
}
```

([src/timer.c, lines 68 to 95](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/timer.c#L68-L95)) Note that it begins with `uv_timer_stop(handle)`: starting a timer that is already running takes it out and puts it back with a new `start_id`.

The loop that fires them asks for the minimum over and over:

```c
for (;;) {
  heap_node = heap_min(timer_heap(loop));
  if (heap_node == NULL)
    break;

  handle = container_of(heap_node, uv_timer_t, node.heap);
  if (handle->timeout > loop->time)
    break;

  uv_timer_stop(handle);
  uv__queue_insert_tail(&ready_queue, &handle->node.queue);
}
```

([src/timer.c, lines 173 to 184](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/timer.c#L173-L184)) It stops at the first timer whose `timeout` is greater than the loop's time, and until then takes the minimum off the heap and queues it to run. A timer is due when its timeout is **at most** the loop's time. That is your `advance`.

## Go: four children per node

The Go runtime keeps timers in heaps too: "Active timers live in heaps attached to P, in the timers field." ([src/runtime/time.go, line 73](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L73)) The heap is not binary: "The heap is 4-ary. See siftupTimer and siftdownTimer." ([src/runtime/time.go, line 990](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L990)) The functions show what that means. The parent of `i` is `(i - 1) / 4`, and the order is by `when` alone:

```go
func siftupTimer(t []*timer, i int) int {
	if i >= len(t) {
		badTimer()
	}
	when := t[i].when
	if when <= 0 {
		badTimer()
	}
	tmp := t[i]
	for i > 0 {
		p := (i - 1) / 4 // parent
		if when >= t[p].when {
			break
		}
		t[i] = t[p]
		i = p
	}
	if tmp != t[i] {
		t[i] = tmp
	}
	return i
}
```

([src/runtime/time.go, lines 1070 to 1091](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L1070-L1091)) Moving down picks the smallest of up to four children, using three comparisons:

```go
func siftdownTimer(t []*timer, i int) {
	n := len(t)
	if i >= n {
		badTimer()
	}
	when := t[i].when
	if when <= 0 {
		badTimer()
	}
	tmp := t[i]
	for {
		c := i*4 + 1 // left child
		c3 := c + 2  // mid child
		if c >= n {
			break
		}
		w := t[c].when
		if c+1 < n && t[c+1].when < w {
			w = t[c+1].when
			c++
		}
		if c3 < n {
			w3 := t[c3].when
			if c3+1 < n && t[c3+1].when < w3 {
				w3 = t[c3+1].when
				c3++
			}
			if w3 < w {
				w = w3
				c = c3
			}
		}
		if w >= when {
			break
		}
		t[i] = t[c]
		i = c
	}
	if tmp != t[i] {
		t[i] = tmp
	}
}
```

([src/runtime/time.go, lines 1095 to 1136](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L1095-L1136)) Here is what four children change, counted on the lines above. A heap of 21 items has 3 rows with four children per item (1 + 4 + 16 = 21), and 5 rows with two (1 + 2 + 4 + 8 + 16 = 31 slots are needed to hold 21). Moving up makes one comparison per row, so it is about half as long. Moving down makes up to 4 comparisons per row, 3 among the children and one against the item, where the textbook binary version makes 2 on more rows, so the totals come out about the same. These source lines do not say why the arity is 4, and this Chapter does not guess.

## nginx: a tree that only looks for the minimum

nginx does not use a heap for its event timers. They live in a tree, and a comment at the top of the file explains why duplicate keys are not a problem: "the event timer rbtree may contain the duplicate keys, however, it should not be a problem, because we use the rbtree to find a minimum timer value only" ([src/event/ngx_event_timer.c, lines 17 to 19](https://github.com/nginx/nginx/blob/37fe98355461d2f03d73e6a8e82ac4e4cd85d711/src/event/ngx_event_timer.c#L17-L19)) The function that asks when the next timer is due takes the smallest node of the tree:

```c
ngx_msec_t
ngx_event_find_timer(void)
{
    ngx_msec_int_t      timer;
    ngx_rbtree_node_t  *node, *root, *sentinel;

    if (ngx_event_timer_rbtree.root == &ngx_event_timer_sentinel) {
        return NGX_TIMER_INFINITE;
    }

    root = ngx_event_timer_rbtree.root;
    sentinel = ngx_event_timer_rbtree.sentinel;

    node = ngx_rbtree_min(root, sentinel);

    timer = (ngx_msec_int_t) (node->key - ngx_current_msec);

    return (ngx_msec_t) (timer > 0 ? timer : 0);
}
```

([src/event/ngx_event_timer.c, lines 32 to 50](https://github.com/nginx/nginx/blob/37fe98355461d2f03d73e6a8e82ac4e4cd85d711/src/event/ngx_event_timer.c#L32-L50)) The tree is a red-black tree, as the first comment of the tree's file says: "The red-black tree code is based on the algorithm described in" ([src/core/ngx_rbtree.c, line 13](https://github.com/nginx/nginx/blob/37fe98355461d2f03d73e6a8e82ac4e4cd85d711/src/core/ngx_rbtree.c#L13)) The sentence goes on to name the book it follows. Same job, different structure, and a different answer to ties: nginx says duplicates are fine, libuv breaks them on purpose.

## What the Problems build

Problem 5 adds `sched ID T`, which starts a timer, and `advance T`, which fires every timer due at time `T` or earlier and prints their IDs in firing order. Timers with the same time fire in the order they were scheduled, as in libuv ([src/timer.c, lines 38 to 55](https://github.com/libuv/libuv/blob/e9f29cb984231524e3931aa0ae2c5dae1a32884e/src/timer.c#L38-L55)). The Extra Problem adds `arity D` so you can try Go's four children ([src/runtime/time.go, line 990](https://github.com/golang/go/blob/a10e42f219abb9c5bc4e7d86d9464700a42c7d57/src/runtime/time.go#L990)), or any number.
