odoo.define('point_of_sale.HeaderButton', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    // Previously HeaderButtonWidget
    // This is the close session button
    class HeaderButton extends PosComponent {
        onClick()  {

            var requestPrinter = myMakeRequest('POST','http://127.0.0.1:8091/openbox');

            requestPrinter.then((responsePrinter) => {

            console.log("result " + responsePrinter);
            }).catch((error)=>  {
                  console.log("error" + error);
                  // this.showPopup('ErrorPopup', {title: 'Error printer 2', body: response.message});
            });

            console.log("ClosePosPopup");

            this.showPopup('ClosePosPopup');
        }
    }
    HeaderButton.template = 'HeaderButton';

    Registries.Component.add(HeaderButton);

    return HeaderButton;
});
