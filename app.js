/* Workbench framework: categories, routing and the home page.
   Tools live in /tools and register themselves with Workbench.registerTool(). */
(function () {
  // Add or rename categories here. A category with no tools shows "coming soon".
  const categories = [
    { id: 'audio', name: 'Audio', tools: [] },
    { id: 'image', name: 'Image', tools: [] },
    { id: 'text',  name: 'Text',  tools: [] }
  ];

  const app = document.getElementById('app');
  const crumbs = document.getElementById('crumbs');
  let cleanup = null;

  window.Workbench = {
    /* tool = { category, id, name, desc, render(root) -> optional cleanup function } */
    registerTool(tool) {
      const c = categories.find(x => x.id === tool.category);
      if (!c) { console.warn('Unknown category for tool:', tool.id); return; }
      c.tools.push(tool);
    }
  };

  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const parts = (location.hash || '#/').slice(1).split('/');
    const c = categories.find(x => x.id === parts[1]);
    const t = c && c.tools.find(x => x.id === parts[2]);
    window.scrollTo(0, 0);
    if (t) {
      crumbs.innerHTML = '<a href="#/">All tools</a> / ' + c.name;
      app.innerHTML = '<section class="tool-page"><h1>' + t.name + '</h1><p class="lead">' + t.desc + '</p><div id="tool-root"></div></section>';
      cleanup = t.render(document.getElementById('tool-root')) || null;
      document.title = t.name + ' | Workbench';
    } else {
      crumbs.textContent = '';
      document.title = 'Workbench: small tools that run in your browser';
      renderHome();
    }
  }

  function renderHome() {
    app.innerHTML =
      '<section class="hero"><h1>Small tools that just work.</h1>' +
      '<p>Everything runs in your browser. Nothing you record or upload leaves your device.</p></section>' +
      categories.map(c =>
        '<section class="cat"><h2>' + c.name + (c.tools.length ? '' : '<small>coming soon</small>') + '</h2>' +
        '<div class="tools">' +
        (c.tools.length
          ? c.tools.map(t => '<a class="tool" href="#/' + c.id + '/' + t.id + '"><h3>' + t.name + '</h3><p>' + t.desc + '</p></a>').join('')
          : '<div class="tool soon"><p>Tools for this category are on the way.</p></div>') +
        '</div></section>'
      ).join('');
  }

  addEventListener('hashchange', route);
  addEventListener('load', route); // runs after every tool script has registered
})();
