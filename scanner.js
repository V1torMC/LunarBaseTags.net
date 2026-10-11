const $ = id => document.getElementById(id);

// High severity (real risk)
const highRules = [
  ['Command execution', /Runtime\.getRuntime|\.exec\s*\(|ProcessBuilder/i],
  ['Shell / PowerShell', /powershell(?:\.exe)?|cmd\.exe|wscript\.shell|cscript\.exe/i],
  ['Remote download + run', /URLDownloadToFile|DownloadFile|WebClient.*Download|Invoke-WebRequest/i],
  ['Process injection', /VirtualAllocEx|WriteProcessMemory|CreateRemoteThread|OpenProcess/i],
  ['Credential stealers', /Login Data|Local State|Cookies|key4\.db|CryptUnprotectData|Discord.*token/i],
  ['Keylogger / screen grab', /GetAsyncKeyState|SetWindowsHookEx|keylogger/i],
  ['Discord / Telegram webhook', /discord(?:app)?\.com\/api\/webhooks|api\.telegram\.org\/bot/i],
  ['Startup persistence', /CurrentVersion\\Run|schtasks|Startup\\|RunOnce/i]
];

// Medium (suspicious depending on context)
const medRules = [
  ['Network sockets', /HttpURLConnection|java\/net\/Socket|okhttp3|openConnection/i],
  ['Dynamic class loading', /URLClassLoader|defineClass|ClassLoader/i],
  ['Native library load', /System\.load|loadLibrary|\.dll|\.so\b/i],
  ['Heavy encoding / packing', /Base64|fromBase64|InflaterInputStream|GZIPInputStream|Cipher\.getInstance/i],
  ['Reflection abuse', /getDeclaredMethod|setAccessible\(true\)|invoke\(/i]
];

// Expected in Minecraft clients / cheats (low weight)
const expectedCheat = [
  /net\.minecraft|Minecraft|Launcher|modid|fabric|forge|mixin/i,
  /Render|Entity|Player|World|Packet|Event/i,
  /clickgui|module|hack|cheat|killaura|tracers|esp\b|xray/i
];

function fmt(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

function extractStrings(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    out += (c >= 32 && c <= 126) ? String.fromCharCode(c) : ' ';
  }
  return out;
}

function addFinding(text, level) {
  const li = document.createElement('li');
  if (level === 'high') li.style.color = '#ff8a8a';
  else if (level === 'med') li.style.color = '#ffd37a';
  else li.style.color = '#9aa3b2';
  li.textContent = text;
  $('findings').appendChild(li);
}

function setVerdict(level, main, sub) {
  const box = $('verdictBox');
  box.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'verdict ' + level;
  div.innerHTML = main + (sub ? '<div class="verdict-sub">' + sub + '</div>' : '');
  box.appendChild(div);
}

$('scanBtn').addEventListener('click', async () => {
  const f = $('fileInput').files[0];
  if (!f) {
    $('status').textContent = 'Choose a file first';
    return;
  }

  const name = f.name.toLowerCase();
  const ext = name.split('.').pop();
  if (!['jar', 'exe', 'zip'].includes(ext)) {
    $('status').textContent = 'JAR / EXE / ZIP only';
    return;
  }

  $('scanBtn').disabled = true;
  $('status').textContent = 'Deep scanning…';
  $('resultTitle').textContent = f.name;
  $('findings').innerHTML = '';
  $('verdictBox').innerHTML = '';
  $('progress').style.width = '8%';

  try {
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const text = extractStrings(bytes);

    $('typeOut').textContent = ext.toUpperCase();
    $('sizeOut').textContent = fmt(f.size);

    // Hash
    if (crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', buf);
      $('hashOut').textContent = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      $('hashOut').textContent = 'Unavailable';
    }

    $('progress').style.width = '35%';

    let high = 0, med = 0;
    const highHits = [];
    const medHits = [];

    // Signature checks
    if (ext === 'jar' || ext === 'zip') {
      const ok = bytes[0] === 0x50 && bytes[1] === 0x4B;
      if (ok) addFinding('Valid ZIP/JAR signature (PK) found.', 'ok');
      else {
        high++;
        addFinding('Missing ZIP/JAR signature — file may be corrupted or fake.', 'high');
      }
    } else if (ext === 'exe') {
      const ok = bytes[0] === 0x4D && bytes[1] === 0x5A;
      if (ok) addFinding('Valid Windows MZ header found.', 'ok');
      else {
        high++;
        addFinding('Missing MZ header — not a valid EXE.', 'high');
      }
    }

    $('progress').style.width = '55%';

    // High severity
    for (const [label, re] of highRules) {
      if (re.test(text)) {
        high++;
        highHits.push(label);
        addFinding('HIGH: ' + label, 'high');
      }
    }

    // Medium
    for (const [label, re] of medRules) {
      if (re.test(text)) {
        med++;
        medHits.push(label);
        addFinding('MEDIUM: ' + label, 'med');
      }
    }

    // Long encoded blobs
    const longBlobs = (text.match(/[A-Za-z0-9_+\/=]{120,}/g) || []).length;
    if (longBlobs > 8) {
      med++;
      addFinding('MEDIUM: ' + longBlobs + ' long encoded/packed looking strings.', 'med');
    }

    // Detect Minecraft / cheat context (reduces false panic)
    let cheatContext = 0;
    for (const re of expectedCheat) {
      if (re.test(text)) cheatContext++;
    }
    if (cheatContext >= 2) {
      addFinding('Context: looks like a Minecraft / game client or cheat (common on this site).', 'ok');
    }

    // Filename hints
    if (/crack|cracked|pirate|nulled|free-download/i.test(name)) {
      med++;
      addFinding('MEDIUM: filename contains crack/pirate indicators.', 'med');
    }

    $('progress').style.width = '90%';

    const total = high + med;
    $('countOut').textContent = high + ' high · ' + med + ' medium';

    // Verdict logic
    if (high === 0 && med === 0) {
      setVerdict('safe', 'SAFE!', 'IT IS SAFE — no high or medium risk indicators found in static scan.');
      $('status').textContent = 'Clean';
    } else if (high === 0 && med <= 3 && cheatContext >= 2) {
      setVerdict('maybe', 'MAYBE SAFE',
        'No critical malware patterns. Some medium flags are present but consistent with a Minecraft client / cheat. Still scan with real AV if unsure.');
      $('status').textContent = 'Review recommended';
    } else if (high === 0) {
      setVerdict('maybe', 'MAYBE SAFE',
        'No critical indicators, but medium flags found: ' + (medHits.join(', ') || 'encoded data') + '. Inspect before running.');
      $('status').textContent = 'Review recommended';
    } else {
      setVerdict('danger', 'NOT SAFE',
        'High-risk indicators: ' + highHits.join(', ') + '. Do not run this file.');
      $('status').textContent = 'Dangerous patterns found';
    }

    addFinding('Scan finished. File was never executed or uploaded.', 'ok');
    $('progress').style.width = '100%';

  } catch (err) {
    $('status').textContent = 'Scan failed';
    addFinding(String(err), 'high');
    setVerdict('danger', 'NOT SAFE', 'Scanner error — treat file as untrusted.');
  } finally {
    $('scanBtn').disabled = false;
  }
});
