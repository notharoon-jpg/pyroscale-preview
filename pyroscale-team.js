(() => {
  const roster = document.getElementById("team-members");
  const title = document.getElementById("team-title");
  const intro = document.getElementById("team-intro");
  const defaultIntro = intro.textContent;
  const normalize = (value, length) => typeof value === "string" ? value.trim().slice(0, length) : "";

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

  function render(team) {
    title.textContent = team.name || "The people behind PyroScale.";
    intro.textContent = team.intro || defaultIntro;
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

  fetch("team.json", {cache: "no-cache"})
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      const profile = teamFrom(data);
      if (profile.members.length) render(profile);
    })
    .catch(() => {
      // Keep the team details already rendered in the HTML.
    });
})();
