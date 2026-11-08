
/**
 * initializes the sticky top bar scroll effect
 */
export function initTopBarScroll() {
    const topBar = document.querySelector(".top-bar");
    const topBarFixedRectangle = document.querySelector(".top-bar-fixedRectangle");

    document.addEventListener("scroll", function() {
        const scrollPosition = window.scrollY;

        if (topBarFixedRectangle) {
            if (scrollPosition > 0) {
                topBarFixedRectangle.style.top = `-${scrollPosition}px`;
            } else {
                topBarFixedRectangle.style.top = "0";
            }
        }

        if (scrollPosition > 10) {
            topBar.classList.add("scrolled");
        } else {
            topBar.classList.remove("scrolled");
        }
    });
}

export function initLinkMenuResize() {
    const wrapper = document.querySelector('.menu-wrapper');
    const btn     = document.getElementById('slide-menu-btn');
    const VISIBLE_LEFT = 10;
    const GAP = 8;

    btn.addEventListener('click', () => {
        const menuWidth = wrapper.querySelector('.group-component').offsetWidth;
        if (wrapper.classList.contains('active')) {
            // hide: shift left by (menu width + gap)
            wrapper.style.left = `-${menuWidth + GAP - 8}px`;
            wrapper.classList.remove('active');
        } else {
            // show: 10px from viewport
            wrapper.style.left = `${VISIBLE_LEFT }px`;
            wrapper.classList.add('active');
        }
    });

    window.addEventListener('resize',() => {
        const menuWidth = wrapper.querySelector('.group-component').offsetWidth;
        if (wrapper.classList.contains('active')) {
            wrapper.style.left = `${VISIBLE_LEFT }px`;
        } else {
            wrapper.style.left = `-${menuWidth + GAP - 8}px`;
        }
    });

    const menuWidth = wrapper.querySelector('.group-component').offsetWidth;
    wrapper.style.left = `-${menuWidth + GAP - 8}px`;
}


