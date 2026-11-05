/** DOM heads-up display and overlay screens. */
export class Hud {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.hud = this.$('hud');
    this.score = this.$('hud-score');
    this.distance = this.$('hud-distance');
    this.lives = this.$('hud-lives');
    this.toast = this.$('hud-toast');
    this.screens = { loading: this.$('screen-loading'), lobby: this.$('screen-lobby'), over: this.$('screen-over') };
    this.loadBar = this.$('load-bar');
    this.loadText = this.$('load-text');
    this._toastTimer = 0;
  }

  setProgress(p, text) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.loadText.textContent = text;
  }

  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    this.hud.classList.toggle('hidden', name !== null);
  }

  update({ score, distance, lives }) {
    this.score.textContent = Math.floor(score);
    this.distance.textContent = `${Math.floor(distance)} m`;
    if (this.lives.childElementCount !== lives) {
      this.lives.textContent = '';
      for (let i = 0; i < lives; i++) {
        const s = document.createElement('span');
        s.textContent = '❤';
        this.lives.appendChild(s);
      }
    }
  }

  flash(text, ms = 700) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  gameOver(score, distance) {
    this.$('final-score').textContent = Math.floor(score);
    this.$('final-distance').textContent = `${Math.floor(distance)} m`;
    this.show('over');
  }
}
