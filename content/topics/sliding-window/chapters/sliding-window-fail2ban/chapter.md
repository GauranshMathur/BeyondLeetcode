# fail2ban: counting failures per host

Many streams are really many streams in one. A log of failed logins mixes the failures of every host that tried, and a rule such as banning a host that fails three times in ten minutes needs one count **per host**, each over its own window. That is a window whose contents are kept in a hash table. This Chapter reads fail2ban 1.1.0, whose manual says its ban action runs "after maxretry log lines matches within last findtime seconds" ([man/jail.conf.5, lines 378 to 379](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/man/jail.conf.5#L378-L379)), and the table it keeps. For how such a table works inside, see [CPython: a dict that probes](/chapters/hash-tables-cpython-dict). Here you need only what the Hash tables Topic established: a lookup, insert or delete is O(1) in the **expected** case.

## Two settings define the window

fail2ban's manual page describes the two settings of a rule. "findtime": "time interval (in seconds or time abbreviation format) before the current time where failures will count towards a ban." "maxretry": "number of failures that have to occur in the last findtime seconds to ban the IP." ([man/jail.conf.5, lines 270 to 274](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/man/jail.conf.5#L270-L274)) So the window is "the last findtime seconds", and the threshold is a count inside it. `Filter.setFindTime` hands the value to the failure manager as its `maxTime`. ([fail2ban/server/filter.py, lines 283 to 286](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/filter.py#L283-L286))

## One dict, one entry per host

The failure manager is a class, `FailManager`. Its failures are one Python `dict`: `self.__failList = dict()`. ([fail2ban/server/failmanager.py, line 42](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L42)) The key is the ticket's ID, which `Ticket.__init__` sets from the IP address it was given ([fail2ban/server/ticket.py, line 51](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L51), `getID` at [lines 95 to 96](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L95-L96)), and each new failure first looks its host up:

```python
fid = ticket.getID()
try:
    fData = self.__failList[fid]
```

([failmanager.py, lines 75 to 77](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L75-L77)) A host that is not in the dict yet raises `KeyError` and gets an entry (the `except KeyError` branch, [lines 98 to 109](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L98-L109)). The check for a ban is a comparison against `maxretry`, and a host that reaches it is deleted from the dict as it is returned:

```python
if data.getRetry() >= self.__maxRetry:
    del self.__failList[fid]
    return data
```

([`toBan`, failmanager.py, lines 157 to 163](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L157-L163)) That is the decision this Chapter is about: the program does not keep one window with every host's failures mixed in. It keeps a table from host to that host's state. Counting for one host does not need to look at any other host.

## The state per host is not a list of times

What does an entry hold? A count and a start time. `FailTicket` starts with `self._firstTime = None` and `self._retry = 1`, and sets the start time to the time of the first failure. ([fail2ban/server/ticket.py, lines 229 to 236](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L229-L236)) A repeat failure calls `fData.adjustTime(unixTime, self.__maxTime)` and then `fData.inc(matches, attempt, count)` ([failmanager.py, lines 88 to 90](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L88-L90)), and `inc` adds to the count: `self._retry += count`. ([ticket.py, lines 268 to 270](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L268-L270))

The window is enforced in `adjustTime`:

```python
def adjustTime(self, time, maxTime):
    """ Adjust time of ticket and current attempts count considering given maxTime
    as estimation from rate by previous known interval (if it exceeds the findTime)
    """
    if time > self._time:
        # expand current interval and attempts count (considering maxTime):
        if self._firstTime < time - maxTime:
            # adjust retry calculated as estimation from rate by previous known interval:
            self._retry = int(round(self._retry / float(time - self._firstTime) * maxTime))
            self._firstTime = time - maxTime
        # last time of failure:
        self._time = time
```

([ticket.py, lines 255 to 266](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/ticket.py#L255-L266))

Read it. No timestamps of the old failures are kept. If the first failure is older than `maxTime`, the count is scaled by `maxTime / (time - firstTime)` and the start moves up to `time - maxTime`. Take 4 failures counted since time 0, a `maxTime` of 10, and a new failure at time 20. The count becomes round(4 / 20 × 10) = 2, and the new failure makes it 3 (arithmetic on the line above). The source calls the result an "estimation from rate". Scaling the count by time treats the earlier failures as if they had been spread evenly over the time since the first one (the source does not say that in words; it follows from the arithmetic), which is the same kind of shortcut as Cloudflare's in the last Chapter. fail2ban trades an exact window for a count and a start time per host.

## Forgetting hosts

A table that only grows is a leak. `cleanup` drops every host whose most recent failure was `maxTime` seconds ago or longer:

```python
def cleanup(self, time):
    time -= self.__maxTime
    ...
    todelete = [fid for fid,item in self.__failList.items() \
        if item.getTime() <= time]
```

([failmanager.py, lines 129 to 147](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/failmanager.py#L129-L147); the `...` stands for lock handling, and the lines after the list go on to delete those hosts from the dict.) The filter calls it from `performSvc`, which sets the next time to run to `tm + 5` and so runs it at most once every 5 seconds unless it is forced ([fail2ban/server/filter.py, lines 460 to 467](https://github.com/fail2ban/fail2ban/blob/61799e15e1dd4389dea0cc7595da0a287835a177/fail2ban/server/filter.py#L460-L467)). So the dict holds the hosts that failed within the window, plus those that have gone quiet since the last sweep.

## What the Problems build

The Build keeps the window exact instead of estimating, and it keeps the same shape: a hash table of what is in the window. Each Language's built-in map (`dict` in Python, `Map` in TypeScript, `map` in Go) is the table here, not the table you built in the Hash tables Topic. Item `i` of the sequence is the host that failed in second `i`, one failure per second. The window is the last `F` seconds. When a second enters, add one to its host's count. When a second leaves, take one away, and delete the host when its count reaches 0, so that the map holds exactly the hosts in the window. That does by construction what `cleanup` does by sweeping. `bans` applies the `findtime`/`maxretry` rule. `distinct` asks for the longest stretch in which no host failed twice, and keeps the index at which each host was last seen. The Extra Problem `cover` keeps a count of what the window still lacks.
