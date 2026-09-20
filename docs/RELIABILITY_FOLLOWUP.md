# Reliability follow-up after 0.1.2

This unreleased patch addresses Claude review findings F5 and F6.

Workers have a five-minute inactivity limit alongside the existing one-minute
startup limit. Messages, text deltas, API execution starts and session events reset
the inactivity timer. DUKE tool execution suspends it, including user approval
waits; after every outstanding tool finishes, the timer starts again. Tool-specific
limits remain in force. There is no total task runtime limit.

An inactivity timeout blocks further worker callbacks and preserves saved work.
It does not trigger model escalation or record a model quality failure. Five
minutes is an initial policy choice: providers that think silently for longer may
be interrupted. It has not yet been calibrated with live long-running tasks.

If a file in a saved review receipt is missing, Retry checks explains which file
is missing and asks the user to restore it or describe the change in a follow-up.
The saved result and previous review remain intact. No worker or new review call
runs against that missing evidence. Cancellation still takes precedence over file
errors. The existing 2 MB receipt behavior is unchanged.

Validation on the development Mac: TypeScript, production build and all 187 tests
passed. Added regression coverage checks progress extending the timer, concurrent
tools, resuming the timer after tools, cancellation during a pending tool, stalled
worker write fencing and neutral outcomes, and deleted review evidence. All model
responses in these tests are synthetic. No release artifact has been built for
this follow-up, and these results do not establish live routing efficiency.
