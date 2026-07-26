const fs = require('fs');
let h = fs.readFileSync('job-apply.html', 'utf8');

const stub = [
  '<script>',
  '(function(){',
  '  var params = new URLSearchParams(location.search);',
  '  var mock = params.get("mock") || "success";',
  '  var realFetch = window.fetch.bind(window);',
  '  window.fetch = function(url, opts){',
  '    if (typeof url === "string" && url.indexOf("/recruitment/applications") !== -1) {',
  '      if (mock === "network") return Promise.reject(new TypeError("Failed to fetch"));',
  '      if (mock === "badjson") return Promise.resolve(new Response("<html>Bad Gateway</html>", {status: 200}));',
  '      if (mock === "fail") return Promise.resolve(new Response(JSON.stringify({error:{message:"Mock server error"}}), {status: 500, headers: {"Content-Type": "application/json"}}));',
  '      if (mock === "duplicate") return Promise.resolve(new Response(JSON.stringify({data:{error:{message:"Already applied"}}, duplicate:true}), {status: 409, headers: {"Content-Type": "application/json"}}));',
  '      return Promise.resolve(new Response(JSON.stringify({data:{match_score: 85, auto_scheduled: true}}), {status: 200, headers: {"Content-Type": "application/json"}}));',
  '    }',
  '    return realFetch(url, opts);',
  '  };',
  '  window.addEventListener("load", function(){',
  '    if (!params.get("auto")) return;',
  '    setTimeout(function(){',
  '      document.getElementById("firstName").value = "Test";',
  '      document.getElementById("lastName").value = "Candidate";',
  '      document.getElementById("email").value = "test@example.com";',
  '      document.getElementById("phone").value = "+15550001234";',
  '      document.getElementById("country").value = "India";',
  '      document.getElementById("location").value = "Mumbai";',
  '      document.getElementById("skills").value = "Skill summary here";',
  '      document.getElementById("gdpr").checked = true;',
  '      var dt = new DataTransfer();',
  '      dt.items.add(new File([new Blob(["%PDF-1.4 fake"])], "cv.pdf", {type: "application/pdf"}));',
  '      document.getElementById("resumeFile").files = dt.files;',
  '      console.log("[HARNESS] submitting form, mock=" + mock);',
  '      try { document.getElementById("applyForm").requestSubmit(); }',
  '      catch(e) { document.getElementById("applyForm").dispatchEvent(new Event("submit", {cancelable: true})); }',
  '      setTimeout(function(){',
  '        var card = document.querySelector(".apply-card");',
  '        var succ = document.getElementById("successState");',
  '        var form = document.getElementById("applyForm");',
  '        console.log("[HARNESS] RESULT mock=" + mock',
  '          + " | successVisible=" + (succ && getComputedStyle(succ).display !== "none")',
  '          + " | formVisible=" + (form && getComputedStyle(form).display !== "none")',
  '          + " | cardHeight=" + (card ? card.offsetHeight : "n/a"));',
  '      }, 1500);',
  '    }, 600);',
  '  });',
  '})();',
  '</' + 'script>'
].join('\n');

h = h.replace('<script src="js/hr-config.js"></script>', '<script src="js/hr-config.js"></script>\n' + stub);
if (h.indexOf('HARNESS') === -1) { console.error('INJECTION FAILED'); process.exit(1); }
fs.writeFileSync('test-job-apply.html', h);
console.log('harness written OK, length=' + h.length);
