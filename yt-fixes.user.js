// ==UserScript==
// @name         YouTube fixes
// @namespace    http://tampermonkey.net
// @version      1.0
// @description:ru  Удаляет стеклянный эффект из меню настроек YouTube, вкладку shorts, устанавливает скорость воспроиздвения и выбирает лучшее качество и позволяет выбирать скорость воспроизведения выше 2x.
// @description:en  Removes settings' glass effect, shorts from burger, sets default playback speed, picks highest available quality (maxQuality), allows setting playback speed over 2x.
// @match        https://youtube.com*
// @grant        GM_addStyle
// @run-at       document-start
// @include      https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

class App {
    #shortsRemoved = false;
    #speedChanged = false;
    #qualityChanged = false;
    #targetSpeed;
    #observer;
    #speedPanelOpening = false;
    #playerObserver;
    #maxQuality = 1440;
    #player;
    #currentUrl = '';
    #video;
    #maxSpeed = 4.0;
    #oldSpeed = null;
    #pressTimer = null;
    #isLongPress = false;
    #longPressSpeed = null;
    #wasPausedOnStart = false;

    constructor(targetSpeed=1.5) {
        this.#targetSpeed = targetSpeed;
        this.#init();
    }

    #init() {
        this.#addWindowURLEventListener();
        const target = document;
        const config = {
            attributes: false,
            childList: true,
            subtree: true,
        };
        this._f = this.#debounce(this.#executor, 100);
        this._callback = (mutationsList, observer) => {
            for (let mutation of mutationsList) {
                if (mutation.type === "childList") {
                    this._f();
                    return;
                }
            }
        }
        this.#observer = new MutationObserver(this._callback);
        this.#observer.observe(target, config);
        this.#addDocumentListeners();
    }

#addWindowURLEventListener(){
        if (window.navigation){

            window.navigation.addEventListener('navigate', (e) => {
                console.log('url changed');
                this.#resetState();
            });}

        else{
            window.addEventListener('popstate', () => {
                console.log('url changed');
                this.#resetState();});
            window.addEventListener('hashchange', () => {
                this.#resetState();
                console.log('url changed')
            });
        }

    }
        #resetState(){
        this.#shortsRemoved = false;
        this.#speedChanged = false;
        this.#qualityChanged = false;

    }
    
    #addDocumentListeners(){
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0 && e.target.matches('video')) {
                this.#isLongPress = false;

                if(!checkVideoElement) return;
                this.#wasPausedOnStart = this.#video.paused;
                this.#pressTimer = setTimeout(() => {
                    this.#onPlayerLongPress(e);
                }, 500);
            }
        }, true);

        document.addEventListener('mouseup', (e) => {

            if (e.isGeneratedByMyExtension) return;
            this.#clearPressTimer();

            if (this.#isLongPress) {
                e.stopImmediatePropagation();
                e.preventDefault();
                const video = document.querySelector('video');
                if (video) {
                    this.#onPlayerLongPressEnd('mouse');
                }
            }
        }, true);


        document.addEventListener('keydown', (e) => {
            if (e.repeat || e.code !== 'Space') return;
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }

            this.#isLongPress = false;
            if (!checkVideoElement) return;
            e.preventDefault();
            this.#pressTimer = setTimeout(() => {

                if(!this.#video) this.#video = document.querySelector('video');
                this.#wasPausedOnStart = this.#video.paused; //saving state to reset after long press end
                if(this.#wasPausedOnStart) this.#video.play().catch(err => console.log("Couldn't start video:", err));

                this.#onPlayerLongPress(e);
            }, 500);
        }, true);

        document.addEventListener('keyup', (e) => {
            if (e.code !== 'Space') return;
            this.#clearPressTimer();

            if (this.#isLongPress) {
                e.stopImmediatePropagation();
                e.preventDefault();

                if (document.querySelector('video')) {
                    this.#onPlayerLongPressEnd('keyboard');
                }
            }
        }, true);


        document.addEventListener('ratechange', (e) => {
            const video = e.target;
            console.log(video.playbackRate);
            if (this.#isLongPress && video && this.#longPressSpeed && video.playbackRate !== this.#longPressSpeed) {
                this.#setPlayerSpeed(this.#longPressSpeed);
            }
            if (!this.#isLongPress && this.#oldSpeed !== null) {
                const targetRestoreSpeed = this.#oldSpeed || this.#targetSpeed;

                if (video.playbackRate !== targetRestoreSpeed) {
                    this.#setPlayerSpeed(targetRestoreSpeed);
                }
                else this.#oldSpeed = null;
                this.#updatePopupTextContent();
            }
        }, true);

        function checkVideoElement(){
            if(!this.#player) this.#player = document.getElementById('movie_player');
            if(!this.#video) this.#video = this.#player.querySelector('video');
            if (!this.#video) return false;
            return true;
        }
    }

    #clearPressTimer() {
        if (this.#pressTimer) {
            clearTimeout(this.#pressTimer);
            this.#pressTimer = null;
        }
    }
    #onPlayerLongPress(e){
        this.#isLongPress = true;
        console.log("Player long press detected");
        const newSpeed = Math.min(Math.ceil(this.#video.playbackRate + 0.05), this.#maxSpeed);
        this.#longPressSpeed = newSpeed;
        this.#setPlayerSpeed(newSpeed, true);

        const overlay = document.querySelector('.ytp-speedmaster-overlay');
        if(overlay.style.display === 'none') overlay.style.display = '';
        const overlaySpeedLabel = document.querySelector('.ytp-speedmaster-label');
        if(overlaySpeedLabel) overlaySpeedLabel.textContent = `${newSpeed}x`;
    }

    #onPlayerLongPressEnd(triggerType='mouse'){
        this.#isLongPress = false;
        this.#longPressSpeed = null;
        console.log("Player long press ended");
        this.#setPlayerSpeed(this.#oldSpeed || this.#targetSpeed);

        //overlay restore
        const overlay = document.querySelector('.ytp-speedmaster-overlay');
        if (overlay) overlay.style.display = 'none';
        if (this.#video && this.#wasPausedOnStart) {
            this.#video.pause();
        }
        this.#wasPausedOnStart = false;
        if(triggerType === 'mouse')
        {
            const player = this.#player || document.getElementById('movie_player');
            if (player) {
                const customMouseUp = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    button: 0
                });
                customMouseUp.isGeneratedByMyExtension = true;

                const customPointerUp = new PointerEvent('pointerup', {
                    bubbles: true,
                    cancelable: true,
                    button: 0,
                    pointerType: 'mouse'
                });
                customPointerUp.isGeneratedByMyExtension = true;
                player.dispatchEvent(customPointerUp);
                player.dispatchEvent(customMouseUp);
            }
        }


    }

    #initPlayerObserver(){
        if (this.#playerObserver) {
            this.#playerObserver.disconnect();
        }
        this._settingsButtonDebounced = this.#debounce(this.#settingButtonOnClick, 200);
        this._updatePopupDebounced = this.#debounce(this.#updatePopupTextContent, 100);
        this._fixSpeedPanelDebounced = this.#debounce(this.#fixSpeedPanel, 100);

        this.#playerObserver = new MutationObserver((mutations) => {
            for (let mutation of mutations) {
                if (mutation.addedNodes.length && mutation.target.matches('div.ytp-popup-content')) {
                    const popup = document.querySelector('.ytp-popup.ytp-settings-menu');
                    if (!popup) return;
                    const speedPanel = popup.querySelector('.ytp-variable-speed-panel-content');
                    const qualityMenu = popup.querySelector('.ytp-quality-menu');
                    if (!speedPanel) {
                        this.#speedPanelOpening = false;
                    }
                    else if (speedPanel && !qualityMenu) {
                        this.#speedPanelOpening = !this.#speedPanelOpening;
                        if (this.#speedPanelOpening) this._fixSpeedPanelDebounced(popup);
                    }
                    if (!this.#speedPanelOpening && !qualityMenu) { //basic settings
                        this._updatePopupDebounced();
                    }
                }
                else if (mutation.type === 'attributes' && mutation.target.matches('.ytp-popup.ytp-settings-menu')){
                    this._settingsButtonDebounced(mutation.target);
                }
            }
        });
        this.#playerObserver.observe(this.#player, { childList: true, subtree: true, attributes: true });
    }

    #settingButtonOnClick(popup){
        if (!popup) return;
        console.log('settings button event fired');
        const parent = popup.parentElement;
    }

    #clearAllListeners(...els){
        return els.map(el=>{
            const clone = el.cloneNode(true);
            el.replaceWith(clone);
            return clone;
        });
    }
    #speedButtonClick(e){
        this.#setPlayerSpeed(+e.target.textContent.replace(',','.'));
    }

    #sliderOnChange(e){
        this.#setPlayerSpeed(e.target.value);

    }
    #sliderOnInput(e){
        this.#setPlayerSpeed(e.target.value);

    }

    #sliderButtonOnClick(e){
        const parent = e.currentTarget.parentElement;;
        const slider = parent.querySelector('input.ytp-input-slider');
        if (!slider) return;
        const span = e.currentTarget.querySelector('span');
        this.#setPlayerSpeed(span.textContent === "+" ? this.#video.playbackRate + 0.05 : this.#video.playbackRate - 0.05);

    }

    #setPlayerSpeed(value,isLongPress=false){
        if (!this.#player) this.#player = document.getElementById('movie_player');
        if(!this.#video) this.#video = this.#player.querySelector('video');
        this.#oldSpeed = (this.#isLongPress && !this.#oldSpeed) ? this.#video.playbackRate : this.#oldSpeed;
        this.#video.playbackRate = (+value).toFixed(2);

        const popup = document.querySelector('.ytp-popup.ytp-settings-menu');
        if(!popup) return;
        this.#updatePopupTextContent();
        const slider = popup.querySelector('input.ytp-input-slider');
        if(!slider) return;
        this.#updateSlider(slider, value);
    }
    #updatePopupTextContent(){
        const popup = document.querySelector('.ytp-popup.ytp-settings-menu');
        const menuItems = popup.querySelectorAll('.ytp-menuitem');
        const speedMenu = Array.from(menuItems).find(item => item.textContent.includes('Скорость') || item.textContent.includes('Speed'));
        const parent = popup.parentElement;
        if(!speedMenu) return;
        speedMenu.querySelector('.ytp-menuitem-content').textContent = +this.#video.playbackRate.toFixed(2);

    }
    #updateSlider(slider, value){
        const newValue = +value;
        slider.value = newValue;
        slider.ariaValueNow = slider.ariaValueText = slider.value;
        const percent = (((slider.value - slider.min)/ (slider.max - slider.min)) * 100).toFixed(4);
        slider.style = `--yt-slider-shape-gradient-percent: ${percent}%;`;
        const span = slider.closest('.ytp-popup.ytp-settings-menu').querySelector('.ytp-variable-speed-panel-display span');
        const s = (+slider.value).toFixed(2);
        span.textContent = `${s}x`;
    }

    #fixSpeedPanel(popup){
        let chips = document.querySelector('.ytp-variable-speed-panel-chips');
        if (!chips) return;
        let buttons = chips.querySelectorAll('.ytp-variable-speed-panel-preset-button-wrapper button');
        const index = [...buttons].findIndex(b=>b.textContent === '3,0'); //yotube premium promo button
        if(index > 0) {
            buttons[index].parentElement.remove();
        }
        chips = this.#addButtons(popup, chips);
        buttons = chips.querySelectorAll('.ytp-variable-speed-panel-preset-button-wrapper button');
        [...buttons].forEach(b=>{
            [b] = this.#clearAllListeners(b);
            b.addEventListener('click', this.#speedButtonClick.bind(this));

        });
        let slider = popup.querySelector('input.ytp-input-slider');
        //removing listeners from slider
        [slider] = this.#clearAllListeners(slider);
        slider.addEventListener('change',this.#sliderOnChange.bind(this));
        slider.addEventListener('input', this.#sliderOnInput.bind(this));
        slider.max = this.#maxSpeed;
        slider.ariaValueMax = slider.max;
        const percent = (((slider.value - slider.min)/ (slider.max - slider.min)) * 100).toFixed(4);
        slider.style = `--yt-slider-shape-gradient-percent: ${percent}%;`;
        this.#updateSlider(slider, this.#video.playbackRate);

        //removing listeners from + - buttons
        let changeSpeedButtons = popup.querySelectorAll('.ytp-variable-speed-panel-slider-container button');
        changeSpeedButtons = this.#clearAllListeners(...changeSpeedButtons);
        changeSpeedButtons.forEach(b=>{b.addEventListener('click', this.#sliderButtonOnClick.bind(this))});
    }

    #addButtons(popup, chips){
        const panel = popup.querySelector('.ytp-variable-speed-panel-content');
        let panelWidth = panel.offsetWidth;
        const buttons = chips.querySelectorAll('.ytp-variable-speed-panel-preset-button-wrapper button');
        [...buttons].forEach(b=>{
            b.hidden = false;
            const parent = b.parentElement;
            if (parent){
                parent.ariaHidden = false;
                parent.style.display = '';
            }
        });


        const borders = +getComputedStyle(panel).paddingLeft.split('px')[0] + +getComputedStyle(panel).paddingRight.split('px')[0];
        panelWidth -= borders;
        const buttonWidth = chips.querySelector('button').offsetWidth;
        chips.style.width = 'max-content';
        const realChipsWidth = chips.offsetWidth;
        if(panelWidth - realChipsWidth >= buttonWidth){
            let newSpeed;
            const lastButtonSpeed = +buttons[buttons.length-1].textContent.replace(',','.');
            if(this.#maxSpeed - lastButtonSpeed < 1) newSpeed = this.#maxSpeed;
            else if (this.#maxSpeed - lastButtonSpeed >= 1 && this.#maxSpeed - lastButtonSpeed < 2) newSpeed = lastButtonSpeed + 0.5;
            else newSpeed = lastButtonSpeed + 1;
            newSpeed = newSpeed.toFixed(1);
            const buttonToAdd = buttons[1].parentElement.cloneNode(true);
            buttonToAdd.querySelector('button').textContent = newSpeed.replace('.',',');
            chips.appendChild(buttonToAdd);
        }
        return chips;
    }
    #executor() {

        const url = window.location.href;
        if (!this.#shortsRemoved) this.#shortsRemoved = this.#removeShorts();
        if (!this.#speedChanged) this.#speedChanged = this.#changePlaybackSpeed();
        if (!this.#qualityChanged) this.#qualityChanged = this.#changeQuality();
    }
    
    #debounce(func, timeout) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => { func.apply(this, args); }, timeout);
        };
    }
    
    #removeShorts() {
        const shorts = document.querySelector('#items a[title="Shorts"]');
        if (!shorts) return false;
        shorts.remove();
        console.log('removed shorts');
        return true;
    }

    #changePlaybackSpeed() {
        const video = document.querySelector('video.video-stream.html5-main-video');
        const player = document.getElementById('movie_player');
        if (!video || !video.src || video.readyState === 0) return false;
        this.#player = player;
        this.#player.setPlaybackRate(this.#targetSpeed);
        console.log(+this.#targetSpeed);
        this.#video = this.#player.querySelector('video');
        this.#initPlayerObserver(); //when player is present it will have controls
        return true;
    }

    #changeQuality(){
        const video = document.querySelector('video.video-stream.html5-main-video');
        if (!video || !video.src || video.readyState === 0) return false;
        const player = document.getElementById('movie_player');
        if (!this.#player) this.#player = player;
        try{
            const availableQuailities = this.#player.getAvailableQualityData();
            if (!availableQuailities) return false;
            let highestQuality = availableQuailities[0];
            const value = +highestQuality.qualityLabel.split('p')[0];
            if (value > this.#maxQuality)
            {
                highestQuality = availableQuailities.find(q=>+q.qualityLabel.split('p')[0] <= this.#maxQuality);
            }
            this.#player.setPlaybackQualityRange(highestQuality.quality);

        }
        catch(e){
            console.log(e);
            return false;
        }
        return true;

    }
}

(function() {
    'use strict';

    const css = `
        .ytp-popup.ytp-settings-menu {
            background: rgba(28, 28, 28, 1) none repeat scroll 0% 0% / auto padding-box border-box !important;
            backdrop-filter: none !important;
            background-color: rgba(28, 28, 28, 1) !important;
            -webkit-backdrop-filter: none !important;
        }
        .ytp-popup.ytp-settings-menu.ytp-popup-animating {
         -webkit-transition: none !important;
         transition: none !important;
        }
        .ytp-right-controls, .ytp-play-button, .ytp-volume-area, .ytp-time-wrapper, .ytp-chapter-title.ytp-button, .ytPlayerQuickActionButtonsHost, .ytp-popup.ytp-contextmenu {
        background: rgba(28, 28, 28, 1) !important;
        }
    `;

    if (typeof GM_addStyle !== 'undefined') {
        GM_addStyle(css);
    } else {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }
    console.log('Стили для меню настроек успешно применены.');
    const app = new App();
})();


