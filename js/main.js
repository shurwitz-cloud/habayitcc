/* ============================================
   HABAYIT — SHARED MAIN.JS
   Navigation behavior used on every page
   ============================================ */

function toggleMenu(){
  document.getElementById('mobileMenu').classList.toggle('open');
}
function toggleMobileSub(id){
  var targetId = id || 'mobileSub';
  document.getElementById(targetId).classList.toggle('open');
}
