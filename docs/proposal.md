# Model Planes

## Project Proposal

### A benchmark for supervisory control under bounded computation

## Project summary

Model Planes will be a dynamic benchmark in which frontier AI models manage aircraft approaching a two-runway airport. Aircraft enter the controlled airspace with different positions, headings, speeds, altitudes, performance limits, and separation requirements. The controllers must keep every aircraft safely separated while sequencing arrivals, managing congestion, and landing as much traffic as possible.

The project will investigate a central question:

> As a dynamic system approaches capacity, can AI controllers preserve safety by anticipating future constraints and deliberately sacrificing efficiency, or do they continue pursuing throughput until control breaks down?

The benchmark will begin as a tick-based simulation and progress toward deterministic real-time operation. Multiple model agents will be available, but they will not be assigned a prescribed organizational structure. They may divide aircraft, specialize by function, centralize decisions, or develop another approach. Their organization will be recorded as an emergent strategy rather than assumed to be the benchmark's primary scientific construct.

The intended result is a reproducible experimental platform for studying predictive control, online scheduling, bounded deliberation, robustness, and graceful degradation in frontier models.

## Why this project

Most model evaluations present a fixed problem and wait for an answer. Model Planes instead places models inside a continuing process where every decision changes the next problem, delayed decisions may become invalid, and locally reasonable actions can eliminate safe options later.

The task combines several properties that rarely appear together in model benchmarks:

- continuous state changes;
- hard safety constraints;
- competing short- and long-term objectives;
- future consequences that must be projected from current trajectories;
- new work arriving while existing work remains unfinished;
- sequence-dependent runway capacity;
- incomplete time to deliberate;
- rare failures with disproportionate consequences;
- the need to recognize overload and degrade safely.

These properties make the puzzle a compact supervisory-control microworld. The models will issue high-level clearances, while a deterministic simulator remains authoritative over aircraft motion, legal transitions, separation measurement, and runway state.

The project is not intended to demonstrate readiness for operational aviation. Its value lies in creating a controlled abstract environment in which sophisticated dynamic behavior can be measured precisely and replayed exactly.

## Research objectives

### 1. Predictive control

Evaluate whether models reason over future trajectories rather than react only to the current snapshot. Strong controllers should identify emerging conflicts early, preserve maneuvering options, and update plans as conditions change.

### 2. Online sequencing and congestion management

Evaluate whether models can schedule arrivals when runway service time depends on the order and class of aircraft. Strong controllers should understand that balancing aircraft counts across two runways is not necessarily the same as balancing work.

### 3. Safe behavior near capacity

Identify the traffic conditions under which each controller ceases to maintain safety. Determine whether performance degrades gradually, exhibits a threshold, or collapses after a burst of coupled conflicts.

### 4. Bounded and time-dependent reasoning

Measure how models allocate limited computation among threats of different urgency. In real-time conditions, additional thought can improve a plan while simultaneously making its inputs stale.

### 5. Robustness and recovery

Test whether controllers tolerate uncertainty in estimated arrival times, wind, response delays, and aircraft behavior. Measure whether they recover from disruptions without excessive replanning or command reversal.

### 6. Emergent multi-agent organization

Observe how teams allocate authority, aircraft, monitoring, and planning without being given a required hierarchy. Compare the resulting strategies under matched traffic and inference budgets.

## Core design

### The simulated airspace

The environment will contain:

- a bounded terminal-control radius;
- two runways with configurable independence or coupling;
- aircraft entering from multiple directions and altitudes;
- heterogeneous speed, climb, descent, and turn limits;
- aircraft-class-dependent separation rules;
- approach, final, landing, runway-occupancy, go-around, and exit modes;
- finite fuel or time windows that prevent indefinite holding;
- configurable wind, forecast error, and response delay.

The simulation will use explicit, versioned rules. Every state transition will be deterministic for a given scenario seed unless a declared seeded stochastic process is enabled.

### Controller actions

Agents will issue structured supervisory commands rather than directly manipulate coordinates. The initial action vocabulary should include:

- assign heading;
- assign target altitude;
- assign speed;
- hold or continue holding;
- assign or change runway;
- clear for approach;
- clear to land;
- order a go-around;
- divert an aircraft when continued service is unsafe.

Each command will have a simulation timestamp and an effective time. The system will distinguish the state the agent observed from the state in which its command was applied.

### Authoritative simulation records

Every run will preserve:

1. the complete observed state supplied to each agent;
2. agent messages and tool use;
3. the raw command proposed by an agent;
4. any legality or safety intervention;
5. the command actually applied;
6. the resulting aircraft and runway state;
7. all safety margins and scoring events;
8. provider, model, prompt, budget, and latency metadata.

This separation is essential. A safety system that repeatedly rescues a controller must not make the controller itself appear safe.

## Time regimes

The project will use four progressively demanding regimes.

### Regime 1: Generous frozen ticks

The simulator pauses at each decision point. Agents receive the same snapshot, have a generous reasoning allowance, and submit a complete action package before the next tick.

This establishes the planning ceiling and supports deterministic debugging. It is the correct starting point for validating the plant, scenario generator, and scoring system.

### Regime 2: Budgeted frozen ticks

The state remains frozen, but agents receive a fixed token, call, or time budget. This isolates bounded deliberation from state staleness.

### Regime 3: Deterministic asynchronous time

The simulation clock advances while models deliberate. Observation delivery, team communication, inference, command transmission, and aircraft response each have seeded delays.

This will be the principal scientific real-time condition. It permits exact replay and causal comparisons while creating the defining challenge of live control: the world changes during thought.

### Regime 4: Natural wall-clock operation

The system runs against actual provider and network latency. These experiments evaluate the complete deployed stack rather than model capability in isolation. They will be conducted only after the deterministic asynchronous benchmark is stable.

## Experimental variables

The benchmark will vary independent dimensions rather than use a single undifferentiated difficulty level.

### Runway load

Traffic will be generated at several fractions of empirically measured runway capacity, including underloaded, near-capacity, and overloaded conditions. Aircraft-class mixture and leader-follower separation will vary independently from arrival count.

### Interaction load

Scenarios with the same number of aircraft will differ in conflict-graph density, clustering, crossing geometry, urgency, and available maneuvering space.

### Uncertainty

Conditions will include exact trajectories, bounded prediction error, stochastic arrival-time error, wind changes, and aircraft-response jitter.

### Latency

Observation delay, teammate-message delay, inference time, command delay, and aircraft-response delay will be manipulated independently. Fixed, jittered, and heavy-tailed delays will be treated as different conditions.

### Maneuver authority

Agents may receive speed-only, horizontal, or full three-dimensional maneuver authority. This tests whether additional freedom increases recoverable capacity or simply increases planning complexity.

### Commitment pressure

Some conditions will impose freeze horizons or costs for changing previously announced runway assignments, landing slots, or trajectories. Others will introduce deferred instructions that must be executed when a future event occurs.

### Team configuration

Experiments will vary the number of available agents and the shared communication surface. Team conditions will be compared with a solo controller receiving a matched total inference budget.

## Primary hypotheses

The first study will preregister the following hypotheses:

- Longer lookahead will improve safety in frozen ticks, but its benefit will diminish or reverse when deliberation makes observations stale.
- Aircraft-class-aware sequencing will outperform first-come-first-served policies most strongly near runway capacity.
- Runway utilization and airspace interaction complexity will independently predict controller failure.
- Strong controllers will respond to overload by reducing throughput before allowing safety margins to collapse.
- Variable response delay will be more damaging than an equal mean fixed delay.
- Longer deferred-action intervals will increase omitted and late commitments.
- Freeze horizons will reduce command churn but make recovery from unexpected disturbances more expensive.
- Safety filters will improve executed safety while raw unsafe-command rate remains a meaningful discriminator between controllers.

## Evaluation

Safety will be noncompensatory. High throughput will never erase a collision or severe separation loss in the reported results.

### Safety outcomes

- collisions and runway incursions;
- probability, depth, and duration of separation violations;
- minimum horizontal and vertical separation;
- time-to-conflict when the controller intervenes;
- entry into a state from which no safe resolution remains;
- unsafe commands proposed by agents;
- safety-filter or fallback interventions.

### Capacity and efficiency outcomes

- completed landings per simulated hour;
- backlog growth by runway;
- mean and p95 waiting time;
- recovery time following an arrival burst;
- excess landing separation;
- holding time, path length, and delay;
- fuel or time-window exhaustion;
- regret against an offline optimum on solvable instances.

### Timeliness and control quality

- time to first executable safe plan;
- missed decision deadlines;
- observation and plan age when commands are applied;
- commands invalidated before execution;
- runway reassignments and landing-order displacement;
- heading, altitude, and speed reversals;
- plan half-life and total command variation;
- omitted, premature, late, duplicated, or superseded deferred actions.

### Tail behavior

The project will report full safety distributions rather than only means. Measures will include worst episode harm, low outcome quantiles, and conditional value at risk for the maximum violation reached during a run.

Naturalistic scenarios and conflict-enriched stress tests will be reported separately. Stress-test failure rates will not be presented as estimates of ordinary failure prevalence.

## Baselines

The initial benchmark will include deterministic reference policies:

- first-come-first-served landing order;
- earliest-estimated-arrival sequencing;
- round-robin runway assignment;
- join-shortest-queue assignment;
- join-lowest-expected-workload assignment;
- aircraft-class-based runway splitting;
- greedy earliest-conflict-first resolution;
- reactive minimum-separation control;
- rolling-horizon numerical optimization;
- offline full-information optimization for small instances.

Model conditions will include:

- solo model;
- free-form multi-agent team;
- raw model control;
- model control with legality enforcement;
- model control with a full safety fallback.

## Scientific protocol

The project will follow several rules intended to make comparisons interpretable:

- publish the simulator, scenario generator, rules, and scoring functions;
- version the plant, prompts, action schema, and safety policies;
- use matched scenario seeds across controller conditions;
- keep model and team inference budgets comparable where required;
- separate exploratory tuning scenarios from held-out evaluation scenarios;
- preregister primary hypotheses and outcome order before final runs;
- report every attempted run, including provider failures and invalid outputs;
- preserve immutable traces sufficient for exact deterministic replay;
- report confidence intervals and full distributions;
- avoid rare-event probability claims unsupported by the number of trials;
- distinguish model performance from tool-assisted and safety-protected system performance.

The main result will be a capacity surface over runway load, interaction complexity, uncertainty, and delay. Controller comparisons will examine both the location of the safe operating boundary and the manner in which performance deteriorates around it.

## Development plan

### Phase 1: Deterministic simulator

Build the aircraft plant, runway state machines, command schema, separation checker, seeded scenario generator, and replay trace. Validate all physical and legal invariants with scripted controllers.

Exit criterion: identical commands and seed always produce an identical verified trace.

### Phase 2: Tick-based benchmark

Implement generous and budgeted frozen ticks, deterministic baselines, small-instance offline optimization, and initial model adapters.

Exit criterion: baseline policies produce stable, explainable results across low, near-capacity, and overload scenarios.

### Phase 3: Capacity study

Generate the factorial runway-load and interaction-load suite. Add model teams, matched solo controls, held-out scenarios, and statistical reporting.

Exit criterion: the platform can estimate a controller's safe capacity boundary with uncertainty.

### Phase 4: Robustness and deferred control

Add trajectory error, response jitter, wind, future commitments, freeze horizons, and burst-recovery scenarios.

Exit criterion: uncertainty and commitment costs are independently configurable and exactly replayable.

### Phase 5: Deterministic real time

Introduce the virtual asynchronous clock and separate delay channels. Require agents to maintain an executable safe action package while continuing optional deliberation.

Exit criterion: identical controller outputs and latency seeds recreate the same real-time run.

### Phase 6: Wall-clock experiments

Run selected frontier systems under natural provider latency. Preserve request timing, retries, failures, and service metadata.

Exit criterion: results clearly distinguish deterministic benchmark performance from end-to-end deployed-system performance.

## Risks and mitigations

### The environment becomes too realistic

Detailed aviation simulation could consume the project without improving the research question. The first version should use simplified but explicit dynamics and avoid claims about operational ATC validity.

### A scalar score hides unsafe behavior

Publish a lexicographic outcome vector and safety-throughput frontiers. Provide a scalar score only as a secondary convenience, if at all.

### Safety infrastructure solves the benchmark

Keep legality checks narrow, preserve every raw command, and run raw and protected conditions separately.

### Real-time results are dominated by provider variance

Make deterministic asynchronous time the main causal experiment. Treat natural wall-clock operation as a system-level extension.

### Scenarios are accidentally impossible

Use offline optimization and approximate viability checks for small and medium scenarios. Label deliberately overloaded or adversarial cases rather than treating them as ordinary solvable trials.

### Aircraft count becomes a misleading difficulty label

Publish runway utilization, traffic mix, conflict-graph structure, urgency, and maneuver authority for every scenario.

### Human concepts are overclaimed

Use human-factors research to design manipulations, but define attention, deferred control, and overload through directly observable model behavior.

## Project outputs

The first complete release should include:

- a deterministic, versioned ATC simulator;
- a structured controller API;
- a scenario generator with declared difficulty dimensions;
- baseline scheduling and conflict-resolution controllers;
- an offline oracle for bounded instances;
- replayable event and communication traces;
- raw and safety-protected evaluation modes;
- a benchmark suite spanning low load through controlled overload;
- a statistical analysis package for capacity curves and tail risk;
- a study report comparing frontier models and team configurations.

## Success criteria

The project will be successful if it can answer, with reproducible evidence:

1. How far ahead do frontier controllers act before a conflict becomes urgent?
2. Can they sequence heterogeneous arrivals more effectively than simple runway policies?
3. Where is each controller's safe capacity boundary?
4. Does failure emerge from runway congestion, interaction congestion, or both?
5. Does additional deliberation help or hurt when the world advances during inference?
6. Do controllers degrade safely under overload?
7. How robust are their plans to uncertainty and delay?
8. How much apparent competence comes from safety infrastructure rather than the controller?
9. What organizational strategies emerge when multiple agents are free to coordinate?

If those questions can be answered cleanly, Model Planes will provide something uncommon in current model evaluation: a controlled view of how frontier systems behave not only when a dynamic problem is solvable, but as it approaches and crosses the boundary of what they can safely control.

## Literature review

### Receding-horizon and predictive control

Model-predictive control provides the clearest formal analogue for the tick-based puzzle. A controller predicts the system over a finite horizon, optimizes a sequence of actions subject to constraints, applies the first action, then repeats the process from the next observed state. Mayne et al. establish the canonical constrained MPC framework, including the conditions required for stability and recursive feasibility. Zhang et al. apply receding-horizon control directly to aircraft conflict resolution and include wind-induced model mismatch.

This literature supports measuring more than eventual success. The benchmark should record how far ahead agents identify conflicts, whether their actions preserve a feasible continuation, and how much maneuvering margin remains after each decision. It also motivates the horizon-latency hypothesis: longer deliberation should improve plans when the world is frozen, but may reduce performance when computation causes observations to become stale.

The models should not be described as implementing MPC merely because they replan. Formal guarantees depend on known dynamics, specified terminal conditions, feasible numerical optimization, and appropriate update rates. A numerical receding-horizon controller should instead serve as a comparison baseline.

### Hybrid systems, reachability, and recoverability

Aircraft control is naturally hybrid. Continuous position, velocity, and altitude evolve inside discrete modes such as vectoring, approach capture, final approach, go-around, runway occupancy, and exit. Tomlin, Pappas, and Sastry model aircraft conflict resolution as a multi-agent hybrid control problem. Mitchell, Bayen, and Tomlin develop backward reachable sets for systems with controls and bounded disturbances.

The important benchmark implication is that failure can occur before a collision. A controller has already failed strategically when it permits the system to enter a state from which no admissible action can prevent a future safety violation. The project should therefore estimate time-to-unrecoverability and residual viability margin in addition to closest approach.

Exact reachability becomes intractable as the number of aircraft grows. The initial system should use numerical trajectory projection and pairwise or decomposed reachability approximations. These are useful safety oracles but must not be presented as exact global guarantees.

### Safety filters and fallback control

Control-barrier-function research provides a framework for minimally modifying a nominal action so the system remains inside a safe set. Simplex architectures pair an unverified advanced controller with a verified fallback and switch before the plant leaves a recoverable region.

These ideas support three distinct benchmark conditions: raw model control, model control with legality enforcement, and model control with a full safety fallback. Every condition must preserve the model's original proposal. Intervention frequency, edit magnitude, and the difference between proposed and executed outcomes are part of the result.

The collision-avoidance literature also exposes a second issue: safety does not guarantee liveness. A controller can avoid immediate collisions while deadlocking traffic, accumulating unbounded holding queues, or forcing excessive detours. Safety metrics must therefore precede but not replace landing completion, queue stability, and recovery measures.

### Aircraft landing and sequence-dependent scheduling

Beasley et al. formulate aircraft landing as scheduling with release times, earliest and latest landing windows, multiple runways, and sequence-dependent separation. The required time between two landings depends on the leader-follower aircraft pair. This makes the runway problem qualitatively different from simply sorting aircraft by arrival time.

Baeuerle, Engelhardt-Funke, and Kolonko analyze one- and two-runway systems as queues with class-dependent, correlated service times. For an idealized stationary runway, utilization can be approximated as:

`rho = arrival_rate * expected_sequence_dependent_service_time`

As rho approaches one, small sequencing mistakes or ignored service-time correlations can create rapidly growing delay. For two runways, balancing the number of aircraft does not necessarily balance expected work. This supports using runway utilization and traffic mix as experimental variables rather than raw aircraft count.

Balakrishnan and Chandran study constrained position shifting, in which aircraft can move only a limited number of places from first-come-first-served order. This offers a principled way to introduce fairness or commitment constraints. Beasley et al.'s dynamic scheduling work adds displacement costs for changing an existing plan. Together, these sources motivate freeze horizons, runway-reassignment costs, sequence displacement, and plan stability as benchmark features.

Chandran and Balakrishnan directly model a reliability-throughput tradeoff: tighter spacing improves capacity but increases the probability of a separation failure under uncertainty. The benchmark should therefore publish safety-throughput frontiers rather than reduce these competing objectives to one weighted score.

### Stochastic scheduling and robust control

Shone, Glazebrook, and Zografos model continuously evolving arrival estimates, sequence-dependent stochastic landing separation, weather, and repeated resequencing. Their work shows why forecast uncertainty and execution uncertainty should be represented separately. It also introduces a meaningful commitment question: scheduling early creates coordination value but increases exposure to forecast error.

Robust aircraft-conflict work by Dias and Rey shows that uncertainty can initially be absorbed at modest cost but eventually makes some configurations infeasible. Lehouillier et al. examine efficiency alongside the probability that a maneuver must later be reissued under wind, prediction error, and execution delay. These results motivate plan durability, command reissue rate, robustness cost, and infeasible-state frequency as explicit outcomes.

The proposal should not assume that more conservative behavior is always better. Excessive buffers reduce runway use and can create secondary congestion. Controllers should be compared through safety-efficiency frontiers across multiple uncertainty levels.

### Capacity, dynamic density, and congestion transitions

Aircraft count alone is not an adequate difficulty measure. NASA's dynamic-density work combines count with predicted conflicts, nearby-aircraft density, and heading, speed, and altitude changes. Later relational-complexity research similarly indicates that interaction geometry and conflict structure can predict controller difficulty beyond raw count.

Monechi, Servedio, and Loreto simulate an air-traffic network that transitions from a regime where conflicts can be resolved to one where unresolved conflicts proliferate as traffic increases. NASA complexity research also reports model-dependent boundaries between freely flowing and saturated airspace. These studies support searching for a capacity transition, but they do not establish that every ATC system must exhibit a sharp phase change.

Human workload studies are similarly mixed. Lee et al. report a nonlinear threshold in simulated controller workload, while other FAA work has found approximately linear workload growth over the range studied. Model Planes should therefore compare linear, nonlinear, and change-point models and report uncertainty around any estimated breakpoint.

The project will independently manipulate runway utilization and interaction complexity. This is more informative than a single difficulty scale and can reveal whether a failure originated in service congestion, maneuver congestion, or their interaction.

### Anytime computation and metareasoning

Dean and Boddy formalize time-dependent planning in which an algorithm's answer improves with computation but the available response time varies. Horvitz and Rutledge analyze the tradeoff between the expected benefit of further inference and the cost of delayed action. Russell and Wefald frame computation selection as a metareasoning problem: internal work is valuable only through its effect on external decisions.

This literature is central to the asynchronous version. Agents must decide which conflict deserves analysis, when to stop thinking, and what minimum safe action to issue immediately. A strong controller should maintain an executable partial plan while treating efficiency improvements as optional refinement.

Imprecise-computation research divides work into mandatory and optional components so overload produces controlled loss of quality instead of missed deadlines. The direct design implication is to make safety-preserving actions mandatory and throughput optimization optional. Measures should include time to first safe action, improvement after additional deliberation, deadline misses, and cases in which an initially valid plan becomes obsolete before execution.

### Prospective control, attention, and interruption

Simulated ATC research on prospective memory examines deferred intentions such as performing an action when an aircraft reaches a future state. Wilson et al. find that longer retention intervals increase deferred-action error and that maintaining an intention can impose costs on concurrent conflict detection. Loft, Smith, and Remington show that external reminders affect both prospective-action performance and ongoing work.

These results motivate event-triggered obligations, variable retention intervals, contextual reminders, and interruptions. They do not demonstrate that language models possess human prospective-memory mechanisms. The benchmark should define the construct behaviorally through omitted, early, late, duplicate, and superseded commands.

Attention should also be measured behaviorally: which aircraft are inspected or mentioned, how computation is distributed across conflicts, intervention latency, and how long urgent aircraft remain unexamined. Human subjective workload measures should not be applied directly to models.

### Delay and networked control

Networked-control research shows that sampling, variable communication delay, packet loss, and actuation latency can affect closed-loop feasibility and stability. Predictive networked control sometimes compensates by transmitting time-indexed action sequences or maintaining contingency actions.

For Model Planes, observation delivery, teammate communication, model inference, command transmission, acknowledgement, and aircraft response must be separate timestamped channels. Mean delay, jitter, heavy-tailed outliers, and correlation should be manipulated independently. This makes it possible to distinguish a slow controller from one that fails to account for known latency.

The deterministic asynchronous simulator is essential because natural provider latency is not controlled. Wall-clock results remain valuable, but they measure the complete model-service-tool stack.

### Tail risk and noncompensatory safety

Risk-sensitive control uses measures such as conditional value at risk to represent both the probability and severity of bad outcomes. Chapman, Fauss, and Smith focus on the maximum cost reached anywhere along a trajectory, which is appropriate for brief but severe safety violations that would disappear inside an average tick score.

The project should define episode harm from the maximum separation or runway-safety violation, then report its distribution and worst-tail average. Collisions, separation failures, and runway incursions should remain noncompensatory. Throughput and delay follow only after safety outcomes have been reported.

Rare-event measurement is sample intensive. Naturalistic scenario distributions should estimate ordinary performance, while conflict-enriched and adversarial suites should probe failure modes. Their frequencies must remain separate.

### Literature synthesis

Together, these research areas identify the project as a benchmark for supervisory control near capacity. Its distinctive contribution will be the combination of:

- predictive trajectory management;
- online sequence-dependent scheduling;
- preservation of recoverable states;
- computation whose value decays with time;
- separate runway and interaction bottlenecks;
- explicit uncertainty and latency;
- noncompensatory safety and tail-risk reporting;
- observable degradation from ordinary operation through overload.

The literature also imposes useful limits on interpretation. Numerical control guarantees do not transfer automatically to language-model policies. Human workload evidence motivates scenario design but not claims about model cognition. Simplified terminal-airspace simulations do not establish operational aviation readiness. The benchmark's contribution will be controlled and reproducible evidence about model behavior inside this abstract system.

## Sources

1. Mayne, D. Q., Rawlings, J. B., Rao, C. V., and Scokaert, P. O. M. (2000). [Constrained model predictive control: Stability and optimality](https://experts.illinois.edu/en/publications/constrained-model-predictive-control-stability-and-optimality/). *Automatica*. Canonical MPC framework and formal conditions.
2. Zhang et al. (2016). [Optimal air route flight conflict resolution based on receding horizon control](https://doi.org/10.1016/j.ast.2015.12.024). *Aerospace Science and Technology*. ATC-specific predictive control under wind mismatch.
3. Dias, F., Hijazi, H., and Rey, D. (2019). [Disjunctive linear separation conditions and mixed-integer formulations for aircraft conflict resolution](https://arxiv.org/abs/1911.12997). Numerical formulations suitable for offline feasibility and optimization baselines.
4. Tomlin, C., Pappas, G. J., and Sastry, S. (1998). [Conflict resolution for air traffic management: A study in multiagent hybrid systems](https://doi.org/10.1109/9.664154). *IEEE Transactions on Automatic Control*. Hybrid safety and recoverable-state analysis.
5. Mitchell, I. M., Bayen, A. M., and Tomlin, C. J. (2005). [A time-dependent Hamilton-Jacobi formulation of reachable sets for continuous dynamic games](https://people.eecs.berkeley.edu/~tomlin/papers/MBT05.pdf). *IEEE Transactions on Automatic Control*. Backward reachability under control and disturbance.
6. Chen, M., Shih, C. J., and Tomlin, C. J. (2016). [Multi-vehicle collision avoidance via Hamilton-Jacobi reachability and mixed integer programming](https://arxiv.org/abs/1603.05200). Decomposed safety analysis for multi-vehicle settings.
7. Ames, A. D. et al. (2017). [Control barrier function based quadratic programs for safety critical systems](https://arxiv.org/abs/1609.06408). *IEEE Transactions on Automatic Control*. Minimally invasive safety filtering.
8. Seto, D. et al. (1998). [The Simplex Architecture for Safe On-Line Control System Upgrades](https://experts.illinois.edu/en/publications/the-simplex-architecture-for-safe-on-line-control-system-upgrades/). *American Control Conference*. Advanced controller paired with verified fallback control.
9. Jankovic, M., Santillo, M., and Wang, Y. (2022). [Multi-agent systems with CBF-based controllers: Collision avoidance and liveness from instability](https://arxiv.org/abs/2207.04915). Demonstrates the distinction between safety and productive progress.
10. Beasley, J. E. et al. (2000). [Scheduling aircraft landings - the static case](https://bura.brunel.ac.uk/bitstream/2438/4769/1/Fulltext.pdf). *Transportation Science*. Foundational sequence-dependent aircraft-landing formulation.
11. Beasley, J. E. et al. (2004). [Displacement problem and dynamically scheduling aircraft landings](https://doi.org/10.1057/palgrave.jors.2601650). *Journal of the Operational Research Society*. Dynamic revision and schedule-stability costs.
12. Balakrishnan, H., and Chandran, B. (2010). [Algorithms for scheduling runway operations under constrained position shifting](https://web.mit.edu/hamsa/www/pubs/BalakrishnanChandranConstrainedPositionShifting.pdf). *Operations Research*. Real-time sequencing with fairness constraints.
13. Chandran, B., and Balakrishnan, H. (2007). [A dynamic programming algorithm for robust runway scheduling](https://web.mit.edu/hamsa/www/pubs/ACC07ChandranBalakrishnan.pdf). *American Control Conference*. Explicit reliability-throughput tradeoff.
14. Baeuerle, N., Engelhardt-Funke, O., and Kolonko, M. (2007). [On the waiting time of arriving aircrafts and the capacity of airports with one or two runways](https://publikationen.bibliothek.kit.edu/1000043702/3282465). *European Journal of Operational Research*. Correlated class-dependent service and queue stability.
15. Shone, R., Glazebrook, K., and Zografos, K. G. (2024). [A new simheuristic approach for stochastic runway scheduling](https://eprints.lancs.ac.uk/id/eprint/213518/). *Transportation Science*. Evolving ETA, weather, and landing-separation uncertainty.
16. Dias, F., and Rey, D. (2022). [Robust aircraft conflict resolution under trajectory prediction uncertainty](https://doi.org/10.1016/j.orl.2022.07.010). *Operations Research Letters*. Robustness cost and uncertainty-driven infeasibility.
17. Lehouillier, T. et al. (2017). [Solving the air conflict resolution problem under uncertainty using an iterative biobjective mixed integer programming approach](https://doi.org/10.1287/trsc.2016.0714). *Transportation Science*. Efficiency and maneuver-reissue risk.
18. Laudeman, I. V. et al. (1998). [Dynamic density: An air traffic management metric](https://ntrs.nasa.gov/api/citations/19980210764/downloads/19980210764.pdf). NASA. Structural traffic-complexity factors beyond aircraft count.
19. Monechi, B., Servedio, V. D. P., and Loreto, V. (2015). [Congestion transition in air traffic networks](https://doi.org/10.1371/journal.pone.0125546). *PLOS ONE*. Modeled transition from resolvable to proliferating conflicts.
20. Lee et al. (2005). [A non-linear relationship between controller workload, task load, and traffic density](https://corescholar.libraries.wright.edu/isap_2005/66/). Human-in-the-loop evidence motivating, but not proving, a capacity breakpoint.
21. Dean, T., and Boddy, M. (1988). [An analysis of time-dependent planning](https://cdn.aaai.org/AAAI/1988/AAAI88-009.pdf). *AAAI*. Anytime planning under variable response time.
22. Horvitz, E., and Rutledge, G. (1991). [Time-dependent utility and action under uncertainty](https://erichorvitz.com/timed.pdf). *UAI*. Expected inference value balanced against delay cost.
23. Russell, S., and Wefald, E. (1991). [Principles of metareasoning](https://doi.org/10.1016/0004-3702(91)90015-C). *Artificial Intelligence*. Allocation of computation by its expected effect on action utility.
24. Liu, J. W. S. et al. (1991). [Algorithms for scheduling imprecise computations](https://doi.org/10.1109/2.76287). *IEEE Computer*. Mandatory and optional computation for graceful degradation.
25. Wilson, M. D. et al. (2020). [Prospective memory performance in simulated air traffic control](https://doi.org/10.1177/0018720819875888). *Human Factors*. Retention intervals, deferred intentions, and interruption.
26. Loft, S., Smith, R. E., and Remington, R. W. (2013). [Minimizing the disruptive effects of prospective memory in simulated air traffic control](https://pmc.ncbi.nlm.nih.gov/articles/PMC4428576/). *Journal of Experimental Psychology: Applied*. External reminders and concurrent-task costs.
27. Hespanha, J. P., Naghshtabrizi, P., and Xu, Y. (2007). [A survey of recent results in networked control systems](https://doi.org/10.1109/JPROC.2006.887288). *Proceedings of the IEEE*. Sampling, variable delay, communication loss, and control stability.
28. Pin, G., and Parisini, T. (2011). [Networked predictive control of uncertain constrained nonlinear systems](https://doi.org/10.1109/TAC.2010.2051091). *IEEE Transactions on Automatic Control*. Predictive control under time-varying delay and loss.
29. Chapman, M. P., Fauss, M., and Smith, K. (2021). [On optimizing the conditional value-at-risk of a maximum cost for risk-averse safety analysis](https://arxiv.org/abs/2106.00776). Tail-sensitive analysis of the worst point reached along a trajectory.
30. Samuelson, S., and Yang, I. (2018). [Safety-aware optimal control of stochastic systems using conditional value-at-risk](https://arxiv.org/abs/1802.07903). Risk-sensitive distance from unsafe states.

## Research note

The literature review prioritizes primary peer-reviewed work in control, operations research, real-time systems, human factors, and air-traffic management, supplemented by authoritative NASA research where operational traffic-complexity measures are relevant. Human evidence is used to motivate observable task manipulations rather than claims about model cognition.