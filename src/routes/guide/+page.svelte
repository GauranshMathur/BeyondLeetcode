<svelte:head>
	<title>Guide · BeyondLeetcode</title>
</svelte:head>

<main>
	<header class="intro">
		<span class="eyebrow">Guide</span>
		<h1>How to use the site</h1>
		<p class="lede">A few minutes: what is here, what contains what, and how you move forward.</p>
	</header>

	<div class="layout">
		<nav class="toc" aria-label="On this page">
			<span class="eyebrow">On this page</span>
			<ol>
				<li><span class="num">1</span><a href="#s1">What is on the site</a></li>
				<li><span class="num">2</span><a href="#s2">Read a Chapter</a></li>
				<li><span class="num">3</span><a href="#s3">Build as you solve</a></li>
				<li><span class="num">4</span><a href="#s4">Run, Submit and hints</a></li>
				<li><span class="num">5</span><a href="#s5">Progress and unlocks</a></li>
				<li><span class="num">6</span><a href="#s6">Where to start</a></li>
			</ol>
		</nav>

		<div class="sections">
			<section id="s1" aria-labelledby="h-s1">
				<div class="text">
					<h2 id="h-s1"><span class="num">1</span>What is on the site</h2>
					<p>
						The Map lists every Topic. A Topic holds Chapters. A Chapter is a reading about a real system and
						the data structure decision it made, followed by its Problems.
					</p>
					<figure>
						<svg
							viewBox="0 0 600 150"
							role="img"
							aria-label="What contains what: the Map holds Topics, a Topic holds Chapters and one Build, a Chapter holds a reading and then its Problems, a Problem is one step of the Build."
						>
							<rect x="0" y="16" width="120" height="52" class="box" />
							<text x="60" y="48" text-anchor="middle" class="name">Map</text>
							<rect x="160" y="16" width="120" height="52" class="box" />
							<text x="220" y="48" text-anchor="middle" class="name">Topic</text>
							<rect x="320" y="16" width="120" height="52" class="box" />
							<text x="380" y="48" text-anchor="middle" class="name">Chapter</text>
							<rect x="480" y="16" width="120" height="52" class="box on" />
							<text x="540" y="48" text-anchor="middle" class="name">Problem</text>
							<line x1="120" y1="42" x2="158" y2="42" class="stroke" />
							<polyline points="152,37 158,42 152,47" class="stroke open" />
							<line x1="280" y1="42" x2="318" y2="42" class="stroke" />
							<polyline points="312,37 318,42 312,47" class="stroke open" />
							<line x1="440" y1="42" x2="478" y2="42" class="stroke" />
							<polyline points="472,37 478,42 472,47" class="stroke open" />
							<text x="60" y="92" text-anchor="middle" class="sub">all Topics</text>
							<text x="220" y="92" text-anchor="middle" class="sub">Chapters</text>
							<text x="220" y="110" text-anchor="middle" class="sub">one Build</text>
							<text x="380" y="92" text-anchor="middle" class="sub">a reading</text>
							<text x="380" y="110" text-anchor="middle" class="sub">then Problems</text>
							<text x="540" y="92" text-anchor="middle" class="sub">one Build step</text>
						</svg>
						<figcaption>
							<span class="fig">Fig. 1</span>
							<span>What contains what, from the Map down to one Problem.</span>
						</figcaption>
					</figure>
					<div class="terms">
						<div class="term">
							<h3>Topic</h3>
							<p>One subject, such as heaps, on the Map. It holds an ordered set of Chapters and has one Build.</p>
						</div>
						<div class="term">
							<h3>Chapter</h3>
							<p>
								A reading about one real system and the data structure decision it made, followed by that
								Chapter's Problems.
							</p>
						</div>
						<div class="term">
							<h3>Problem</h3>
							<p>
								One step of the Topic's Build. It asks you to add something to the Build, and your code is
								checked against Tests.
							</p>
						</div>
					</div>
				</div>
				<aside>
					<span class="note">Note 1</span>
					<span>Inside an open Topic, any Problem can be opened at any time.</span>
				</aside>
			</section>

			<section id="s2" aria-labelledby="h-s2">
				<div class="text">
					<h2 id="h-s2"><span class="num">2</span>Read a Chapter</h2>
					<p>A Chapter counts as Read when you reach the end of its reading. There is no button to press.</p>
					<p>Each Chapter ends with its Problems.</p>
				</div>
				<aside>
					<span class="note">Note 2</span>
					<span>Every Hint links back to the Chapter behind its Problem.</span>
				</aside>
			</section>

			<section id="s3" aria-labelledby="h-s3">
				<div class="text">
					<h2 id="h-s3"><span class="num">3</span>Build as you solve</h2>
					<div class="terms">
						<div class="term">
							<h3>Build</h3>
							<p>
								A Topic has one Build: a codebase you grow one Problem at a time, in one Language. You choose
								from Python, TypeScript and Go.
							</p>
						</div>
						<div class="term">
							<h3>Main Line and Extras</h3>
							<p>
								Core Problems make up the Main Line, in order. Each one starts from the Build as the one
								before it left it. Extra Problems branch off the Main Line and are optional: what you write
								in one never flows back into the Main Line.
							</p>
						</div>
					</div>
					<p>
						You can also start a Problem from Reference Code, a known-good Build, instead of from your own
						code.
					</p>
					<figure>
						<svg
							viewBox="0 0 600 190"
							role="img"
							aria-label="Main Line: Core Problems in order, each starting from the Build as the one before left it. An Extra Problem branches off and never flows back."
						>
							<text x="0" y="14" class="sub left">Main Line · Core Problems in order</text>
							<line x1="40" y1="52" x2="100" y2="52" class="stroke on" />
							<line x1="140" y1="52" x2="200" y2="52" class="stroke on" />
							<line x1="240" y1="52" x2="300" y2="52" class="stroke on" />
							<line x1="340" y1="52" x2="400" y2="52" class="stroke on" />
							<rect x="0" y="30" width="40" height="44" class="box" />
							<text x="20" y="57" text-anchor="middle" class="name">1</text>
							<rect x="100" y="30" width="40" height="44" class="box" />
							<text x="120" y="57" text-anchor="middle" class="name">2</text>
							<rect x="200" y="30" width="40" height="44" class="box" />
							<text x="220" y="57" text-anchor="middle" class="name">3</text>
							<rect x="300" y="30" width="40" height="44" class="box" />
							<text x="320" y="57" text-anchor="middle" class="name">4</text>
							<rect x="400" y="30" width="40" height="44" class="box" />
							<text x="420" y="57" text-anchor="middle" class="name">5</text>
							<line x1="120" y1="74" x2="120" y2="124" class="stroke" />
							<polyline points="115,118 120,125 125,118" class="stroke open" />
							<rect x="80" y="126" width="80" height="44" class="box" />
							<text x="120" y="153" text-anchor="middle" class="name">Extra</text>
							<text x="180" y="153" class="sub left">branches off · never flows back</text>
						</svg>
						<figcaption>
							<span class="fig">Fig. 2</span>
							<span>The Main Line, with one Extra branching off.</span>
						</figcaption>
					</figure>
				</div>
				<aside>
					<span class="note">Note 3</span>
					<span>Switching Language starts a new copy of the Build from Reference Code and keeps the old one.</span>
				</aside>
			</section>

			<section id="s4" aria-labelledby="h-s4">
				<div class="text">
					<h2 id="h-s4"><span class="num">4</span>Run, Submit and hints</h2>
					<div class="terms">
						<div class="term">
							<h3>Run</h3>
							<p>Runs your code against the Example Tests, which you can see. It never changes your progress.</p>
						</div>
						<div class="term">
							<h3>Submit</h3>
							<p>
								Checks your Build against every Test of the Problem and of the Core Problems before it. Some
								of those Tests are hidden: if one fails, you see the Verdict but not its input. Only an
								Accepted Submit marks a Problem Solved.
							</p>
						</div>
						<div class="term">
							<h3>Hints</h3>
							<p>One step of guidance, shown one at a time in a fixed order. Hints are free.</p>
						</div>
						<div class="term">
							<h3>Solution</h3>
							<p>
								An explanation and working code in every Language. It is always there when you want it, and
								whether to look is your choice.
							</p>
						</div>
					</div>
				</div>
				<aside>
					<span class="note">Note 4</span>
					<span>Run and Submit sit side by side on the Problem screen.</span>
				</aside>
			</section>

			<section id="s5" aria-labelledby="h-s5">
				<div class="text">
					<h2 id="h-s5"><span class="num">5</span>Progress and unlocks</h2>
					<div class="terms">
						<div class="term">
							<h3>Read</h3>
							<p>A Chapter is Read once you have reached the end of its reading.</p>
						</div>
						<div class="term">
							<h3>Solved</h3>
							<p>A Problem is Solved when you have one Accepted Submission for it.</p>
						</div>
						<div class="term">
							<h3>Complete</h3>
							<p>A Topic is Complete when every Chapter is Read and every Core Problem is Solved. Extras are optional.</p>
						</div>
						<div class="term">
							<h3>Locked and Unlocked</h3>
							<p>
								A Topic with Prerequisites is Locked until every Prerequisite is Complete. Then it is
								Unlocked and you can open it. Several Topics can be open at once, and a Topic with no
								Prerequisites is open from the start. A Complete Topic never locks again, even if new
								content later gives it a Prerequisite you have not finished.
							</p>
						</div>
					</div>
				</div>
				<aside>
					<span class="note">Note 5</span>
					<span>
						The Map is your progress view. When a Submit completes a Topic, the Accepted panel says so and
						names the Topics it unlocks.
					</span>
				</aside>
			</section>

			<section id="s6" aria-labelledby="h-s6">
				<div class="text">
					<h2 id="h-s6"><span class="num">6</span>Where to start</h2>
					<p>Open the Map and pick an Unlocked Topic.</p>
					<a class="button" href="/">Open the Map →</a>
				</div>
			</section>
		</div>
	</div>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		padding-bottom: 96px;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 64px clamp(20px, 6.7vw, 96px) 0;
	}
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}
	h1 {
		margin: 0;
		font-weight: 400;
		font-size: clamp(40px, 5vw, 64px);
		line-height: 1.04;
		letter-spacing: -0.015em;
	}
	.lede {
		margin: 0;
		max-width: 720px;
		font-size: clamp(18px, 1.6vw, 22px);
		font-style: italic;
		line-height: 1.5;
		color: var(--body);
	}
	.layout {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		column-gap: 32px;
		row-gap: 40px;
		padding: 72px clamp(20px, 6.7vw, 96px) 0;
		align-items: start;
	}
	.toc {
		grid-column: 1 / span 3;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.toc ol {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--ink);
	}
	.toc li {
		display: flex;
		gap: 14px;
		align-items: baseline;
		padding: 0;
		border-bottom: 1px solid var(--rule);
	}
	.toc li:last-child {
		border-bottom-color: var(--ink);
	}
	.toc a {
		flex: 1;
		display: block;
		padding: 12px 0;
		min-height: 20px;
		color: var(--ink);
		text-decoration: none;
		font-size: 17px;
	}
	.num {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--muted);
	}
	.sections {
		grid-column: 4 / span 9;
		display: flex;
		flex-direction: column;
		gap: 64px;
	}
	section {
		display: grid;
		grid-template-columns: minmax(0, 600px) 240px;
		column-gap: 40px;
		row-gap: 24px;
		align-items: start;
		scroll-margin-top: 24px;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 20px;
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-weight: 400;
		font-size: 36px;
		line-height: 1.15;
	}
	h2 .num {
		font-size: 16px;
		margin-right: 14px;
	}
	.text p {
		margin: 0;
		font-size: 20px;
		line-height: 1.6;
		color: var(--body);
	}
	.terms {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--ink);
	}
	.term {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 16px 0;
		border-bottom: 1px solid var(--rule);
	}
	h3 {
		margin: 0;
		font-weight: 500;
		font-size: 20px;
		line-height: 1.3;
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	svg {
		display: block;
		width: 100%;
		max-width: 600px;
		height: auto;
		font-family: var(--font-mono);
	}
	.box {
		fill: var(--paper);
		stroke: var(--ink);
		stroke-width: 1.25;
	}
	.box.on {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.stroke {
		stroke: var(--ink);
		stroke-width: 1.25;
		fill: none;
	}
	.stroke.on {
		stroke: var(--accent);
		stroke-width: 2;
	}
	.name {
		font-size: 14px;
		fill: var(--ink);
	}
	.sub {
		font-size: 12px;
		fill: var(--muted);
	}
	.sub.left {
		text-anchor: start;
	}
	figcaption {
		display: flex;
		gap: 24px;
		align-items: baseline;
		font-size: 17px;
		line-height: 1.5;
		color: var(--body);
	}
	.fig {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink);
		white-space: nowrap;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px solid var(--ink);
		font-size: 16px;
		line-height: 1.5;
		color: var(--muted);
	}
	.note {
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--accent);
	}
	.button {
		align-self: flex-start;
		box-sizing: border-box;
		height: 52px;
		padding: 0 28px;
		display: inline-flex;
		align-items: center;
		background: var(--ink);
		color: var(--on-ink);
		border-radius: 2px;
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 500;
	}
	@media (max-width: 1100px) {
		section {
			grid-template-columns: minmax(0, 1fr);
		}
		.toc {
			grid-column: 1 / -1;
		}
		.sections {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 800px) {
		.layout {
			padding-top: 32px;
		}
		.sections {
			gap: 40px;
		}
		h2 {
			font-size: 30px;
		}
		.text p {
			font-size: 18px;
		}
		figcaption {
			flex-direction: column;
			gap: 6px;
		}
		.intro {
			padding-top: 32px;
			gap: 12px;
		}
	}
</style>
