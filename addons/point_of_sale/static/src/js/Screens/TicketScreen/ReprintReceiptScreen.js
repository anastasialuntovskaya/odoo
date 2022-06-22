odoo.define('point_of_sale.ReprintReceiptScreen', function (require) {
    'use strict';

    const AbstractReceiptScreen = require('point_of_sale.AbstractReceiptScreen');
    const Registries = require('point_of_sale.Registries');

    const ReprintReceiptScreen = (AbstractReceiptScreen) => {
        class ReprintReceiptScreen extends AbstractReceiptScreen {
            mounted() {
                this.printReceipt();
            }
            confirm() {
                this.showScreen('TicketScreen', { reuseSavedUIState: true });
            }
            async printReceipt() {
                if(this.env.pos.proxy.printer && this.env.pos.config.iface_print_skip_screen) {
                    let result = await this._printReceipt();
                    if(result)
                        this.showScreen('TicketScreen', { reuseSavedUIState: true });
                }
            }
            async tryReprint() {
                // await this._printReceipt();
                  let props = this.props;
                 let order = props.order;
              if(order._currentlyPrinting === true) {
                    return await this.showPopup('ErrorPopup', {title: 'Печать уже идет', body: 'подождите'});
                }
                if(order._printed === true) {
                    return await this.showPopup('ErrorPopup', {title: 'Чек уже распечатан', body: ''});
                }
                try {
                    order._currentlyPrinting = true;
                    await mercuryPrintCheck(order.export_for_printing(), true);
                    order._printed = true;
                     order._currentlyPrinting = false;
                } catch (error) {
                     order._currentlyPrinting = false;
                    return await this.showPopup('ErrorPopup', mercuryCreateErrorPopupBody(error));
                } finally {
                   order._currentlyPrinting = false;
                }
            }
        }
        ReprintReceiptScreen.template = 'ReprintReceiptScreen';
        return ReprintReceiptScreen;
    };
    Registries.Component.addByExtending(ReprintReceiptScreen, AbstractReceiptScreen);

    return ReprintReceiptScreen;
});
