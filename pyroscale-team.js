(() => {
  const storageKey = "pyroscale.team.v1";
  const defaultIntro = "We’re building PyroScale for the NASA Space Apps Challenge.";
  const editor = document.getElementById("team-editor");
  const form = document.getElementById("team-form");
  const roster = document.getElementById("team-members");
  const fields = document.getElementById("team-fields");
  const template = document.getElementById("team-member-fields");
  const status = document.getElementById("team-status");
  const teamName = document.getElementById("team-name");
  const teamIntro = document.getElementById("team-description");
  const title = document.getElementById("team-title");
  const intro = document.getElementById("team-intro");
  const reset = document.getElementById("reset-team");
  const normalize = (value, length) => typeof value === "string" ? value.trim().slice(0, length) : "";
  let draft = null;
  let previewing = false;

  function teamFrom(data) {
    const source = Array.isArray(data?.members) ? data.members : [];
    return {
      name: normalize(data?.name, 80),
      intro: normalize(data?.intro, 360),
      members: source.map(member => ({
        name: normalize(member?.name, 80),
        role: normalize(member?.role, 90),
        bio: normalize(member?.bio, 260)
      })).filter(member => member.name)
    };
  }

  const defaultProfile = teamFrom({
    name: title.textContent,
    intro: intro.textContent,
    members: Array.from(roster.querySelectorAll("h3"), heading => ({name: heading.textContent}))
  });
  let sharedProfile = defaultProfile;
  function render(team) {
    title.textContent = team.name || "The people behind PyroScale.";
    intro.textContent = team.intro || defaultIntro;
    document.getElementById("team-empty").hidden = team.members.length > 0;
    roster.replaceChildren();
    for (const member of team.members) {
      const item = document.createElement("li");
      const name = document.createElement("h3");
      name.textContent = member.name;
      item.append(name);
      if (member.role) {
        const role = document.createElement("p");
        role.className = "member-role";
        role.textContent = member.role;
        item.append(role);
      }
      if (member.bio) {
        const bio = document.createElement("p");
        bio.textContent = member.bio;
        item.append(bio);
      }
      roster.append(item);
    }
  }

  function addMember(member = {}) {
    const row = template.content.firstElementChild.cloneNode(true);
    for (const input of row.querySelectorAll("[name]")) input.value = member[input.name] || "";
    row.querySelector("[data-remove]").onclick = () => {
      row.remove();
      document.getElementById("add-member").focus();
    };
    fields.append(row);
    return row;
  }

  function readForm() {
    return teamFrom({
      name: teamName.value,
      intro: teamIntro.value,
      members: Array.from(fields.children, row => ({
        name: row.querySelector('[name="name"]').value,
        role: row.querySelector('[name="role"]').value,
        bio: row.querySelector('[name="bio"]').value
      }))
    });
  }

  function fillEditor() {
    const team = draft || sharedProfile;
    teamName.value = team.name;
    teamIntro.value = team.intro;
    fields.replaceChildren();
    team.members.forEach(addMember);
    status.textContent = "";
  }

  document.getElementById("edit-team").onclick = () => {
    fillEditor();
    editor.showModal();
  };
  document.getElementById("add-member").onclick = () => addMember().querySelector("input").focus();
  document.getElementById("cancel-team").onclick = () => editor.close();
  document.getElementById("download-team").onclick = () => {
    if (!form.reportValidity()) return;
    const file = new Blob([JSON.stringify(readForm(), null, 2) + "\n"], {type: "application/json"});
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "team.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  form.onsubmit = event => {
    event.preventDefault();
    draft = readForm();
    previewing = true;
    reset.hidden = false;
    render(draft);
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      editor.close();
    } catch {
      status.textContent = "Your details are visible for this visit. Download the team file to keep them.";
    }
  };

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      draft = teamFrom(JSON.parse(saved));
      reset.hidden = false;
    }
  } catch {
    // The shared team profile can still load when browser storage is unavailable.
  }
  const shared = fetch("team.json", {cache: "no-cache"})
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      const profile = teamFrom(data);
      return profile.members.length ? profile : defaultProfile;
    })
    .catch(() => defaultProfile)
    .then(profile => {
      sharedProfile = profile;
      if (!previewing) render(sharedProfile);
    });
  reset.onclick = async () => {
    await shared;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      status.textContent = "Browser storage is unavailable.";
      return;
    }
    draft = null;
    previewing = false;
    reset.hidden = true;
    render(sharedProfile);
    editor.close();
  };
})();
