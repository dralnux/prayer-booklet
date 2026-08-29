const themeKey = 'catholicTheme';
function initTheme() {
 function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  localStorage.setItem(themeKey, dark ? 'dark' : 'light');
  const button = document.getElementById('siteThemeBtn');
  if(button) button.textContent = dark ? '☀️' : '🌙';
 }
 const savedTheme = (localStorage.getItem(themeKey) || 'light') === 'dark';
 applyTheme(savedTheme);
 let themeButton = document.getElementById('themeBtn');
 if(!themeButton) {
  themeButton = document.createElement('button');
  themeButton.id = 'siteThemeBtn';
  themeButton.className = 'theme-toggle';
  themeButton.title = 'Dark mode';
  themeButton.type = 'button';
  themeButton.textContent = savedTheme ? '☀️' : '🌙';
  const header = document.querySelector('.topbar, .site-header, header');
  if(header) header.appendChild(themeButton);
 }
 if(themeButton.id === 'themeBtn') themeButton.id = 'siteThemeBtn';
 themeButton.onclick = () => applyTheme(!document.body.classList.contains('dark'));
}
if(document.body) initTheme();
else document.addEventListener('DOMContentLoaded', initTheme);
