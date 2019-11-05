import {
    AddChildFromBuilder,
    CoercibleProperty,
    ContainerView,
    CSSType,
    KeyedTemplate,
    Length,
    makeParser,
    makeValidator,
    PercentLength,
    Property,
    Template,
    View
} from 'tns-core-modules/ui/core/view';
import { isIOS } from 'tns-core-modules/platform';
import { Builder } from 'tns-core-modules/ui/builder';
import { Label } from 'tns-core-modules/ui/label';
import { messageType, write } from 'tns-core-modules/trace';
import { Observable } from 'tns-core-modules/data/observable';
import { addWeakEventListener, removeWeakEventListener } from 'tns-core-modules/ui/core/weak-event-listener';
import { ItemsSource } from 'tns-core-modules/ui/list-view/list-view';
import { ObservableArray } from 'tns-core-modules/data/observable-array';
import { GridLayout } from 'tns-core-modules/ui/layouts/grid-layout';
import { layout } from 'tns-core-modules/utils/utils';

export type Orientation = 'horizontal' | 'vertical';

export const ITEMLOADING = 'itemLoading';
export const ITEMDISPOSING = 'itemDisposing';
export const LOADMOREITEMS = 'loadMoreItems';
export namespace knownTemplates {
    export const itemTemplate = 'itemTemplate';
}

export namespace knownMultiTemplates {
    export const itemTemplates = 'itemTemplates';
}

export namespace knownCollections {
    export const items = 'items';
}

export const pagerTraceCategory = 'ns-pager';

export function PagerLog(message: string): void {
    write(message, pagerTraceCategory);
}

export function PagerError(message: string): void {
    write(message, pagerTraceCategory, messageType.error);
}

export * from 'tns-core-modules/ui/core/view';

export interface ItemEventData {
    eventName: string;
    object: any;
    index: number;
    view: View;
    android: any;
    ios: any;
}

export interface ItemsSource {
    length: number;

    getItem(index: number): any;
}

const autoEffectiveItemHeight = 100;
const autoEffectiveItemWidth = 100;

export enum Transformer {
    SCALE = 'scale'
}

export enum Indicator {
    Disabled = 'disable',
    None = 'none',
    Worm = 'worm',
    Fill = 'fill',
    Swap = 'swap',
    THIN_WORM = 'thin_worm',
    Flat = 'flat',
}


@CSSType('Pager')
export abstract class PagerBase extends ContainerView implements AddChildFromBuilder {
    public items: any[] | ItemsSource;
    public selectedIndex: number;
    public itemTemplate: string | Template;
    public itemTemplates: string | Array<KeyedTemplate>;
    public canGoRight = true;
    public canGoLeft = true;
    public spacing: PercentLength;
    public peaking: PercentLength;
    public perPage: number;
    public indicator: Indicator;
    public static selectedIndexChangedEvent = 'selectedIndexChanged';
    public static selectedIndexChangeEvent = 'selectedIndexChange';
    public static scrollEvent = 'scroll';
    public static swipeEvent = 'swipe';
    public static swipeStartEvent = 'swipeStart';
    public static swipeOverEvent = 'swipeOver';
    public static swipeEndEvent = 'swipeEnd';
    public static loadMoreItemsEvent = LOADMOREITEMS;
    public static itemLoadingEvent = ITEMLOADING;
    public orientation: Orientation;
    public _innerWidth: number = 0;
    public _innerHeight: number = 0;
    public _effectiveItemHeight: number;
    public _effectiveItemWidth: number;
    public transformers: string;
    public loadMoreCount: number = 1;
    public _childrenViews: Map<number, View>;
    readonly _childrenCount: number;
    public disableSwipe: boolean = false;
    public showIndicator: boolean;
    // TODO: get rid of such hacks.
    public static knownFunctions = ['itemTemplateSelector', 'itemIdGenerator']; // See component-builder.ts isKnownFunction

    abstract refresh(): void;

    private _itemTemplateSelector: (
        item: any,
        index: number,
        items: any
    ) => string;
    private _itemTemplateSelectorBindable = new Label();
    public _defaultTemplate: KeyedTemplate = {
        key: 'default',
        createView: () => {
            if (this.itemTemplate) {
                return Builder.parse(this.itemTemplate, this);
            }
            return undefined;
        }
    };

    public _itemTemplatesInternal = new Array<KeyedTemplate>(
        this._defaultTemplate
    );


    private _itemIdGenerator: (item: any, index: number, items: any) => number = (_item: any,
                                                                                  index: number) => index

    get itemIdGenerator(): (item: any, index: number, items: any) => number {
        return this._itemIdGenerator;
    }

    set itemIdGenerator(generatorFn: (item: any, index: number, items: any) => number) {
        this._itemIdGenerator = generatorFn;
    }

    get itemTemplateSelector():
        | string
        | ((item: any, index: number, items: any) => string) {
        return this._itemTemplateSelector;
    }

    set itemTemplateSelector(
        value: string | ((item: any, index: number, items: any) => string)
    ) {
        if (typeof value === 'string') {
            this._itemTemplateSelectorBindable.bind({
                sourceProperty: null,
                targetProperty: 'templateKey',
                expression: value
            });
            this._itemTemplateSelector = (item: any, index: number, items: any) => {
                item['$index'] = index;
                if (this._itemTemplateSelectorBindable.bindingContext === item) {
                    this._itemTemplateSelectorBindable.bindingContext = null;
                }
                this._itemTemplateSelectorBindable.bindingContext = item;
                return this._itemTemplateSelectorBindable.get('templateKey');
            };
        } else if (typeof value === 'function') {
            this._itemTemplateSelector = value;
        }
    }

    public _getItemTemplate(index: number): KeyedTemplate {
        let templateKey = 'default';
        if (this.itemTemplateSelector) {
            let dataItem = this._getDataItem(index);
            templateKey = this._itemTemplateSelector(dataItem, index, this.items);
        }

        for (
            let i = 0, length = this._itemTemplatesInternal.length;
            i < length;
            i++
        ) {
            if (this._itemTemplatesInternal[i].key === templateKey) {
                return this._itemTemplatesInternal[i];
            }
        }

        // This is the default template
        return this._itemTemplatesInternal[0];
    }

    public _prepareItem(item: View, index: number) {
        if (this.items && item) {
            item.bindingContext = this._getDataItem(index);
        }
    }

    _getDataItem(index: number): any {
        let thisItems = this.items;
        return thisItems && (<ItemsSource>thisItems).getItem
            ? (<ItemsSource>thisItems).getItem(index)
            : thisItems[index];
    }

    public _getDefaultItemContent(index: number): View {
        let lbl = new Label();
        lbl.bind({
            targetProperty: 'text',
            sourceProperty: '$value'
        });
        return lbl;
    }

    abstract get disableAnimation(): boolean;
    abstract set disableAnimation(value: boolean);

    public abstract itemTemplateUpdated(oldData, newData): void;

    public onLayout(left: number, top: number, right: number, bottom: number) {
        super.onLayout(left, top, right, bottom);
        this._innerWidth =
            right - left - this.effectivePaddingLeft - this.effectivePaddingRight;

        this._innerHeight =
            bottom - top - this.effectivePaddingTop - this.effectivePaddingBottom;
        // @ts-ignore
        this._effectiveItemWidth = isIOS ? layout.getMeasureSpecSize(this._currentWidthMeasureSpec) : this.getMeasuredWidth();
        // @ts-ignore
        this._effectiveItemHeight = isIOS ? layout.getMeasureSpecSize(this._currentHeightMeasureSpec) : this.getMeasuredHeight();
    }

    public convertToSize(length): number {
        let size = 0;
        if (this.orientation === 'horizontal') {
            // @ts-ignore
            size = isIOS ? layout.getMeasureSpecSize(this._currentWidthMeasureSpec) : this.getMeasuredWidth();
        } else {
            // @ts-ignore
            size = isIOS ? layout.getMeasureSpecSize(this._currentHeightMeasureSpec) : this.getMeasuredHeight();
        }

        let converted = 0;
        if (length && length.unit === 'px') {
            converted = length.value;
        } else if (length && length.unit === 'dip') {
            converted = layout.toDevicePixels(length.value);
        } else if (length && length.unit === '%') {
            converted = size * length.value;
        } else if (typeof length === 'string') {
            if (length.indexOf('px') > -1) {
                converted = parseInt(length.replace('px', ''));
            } else if (length.indexOf('dip') > -1) {
                converted = layout.toDevicePixels(parseInt(length.replace('dip', '')));
            } else if (length.indexOf('%') > -1) {
                converted = size * (parseInt(length.replace('%', '')) / 100);
            } else {
                converted = layout.toDevicePixels(parseInt(length));
            }
        } else if (typeof length === 'number') {
            converted = layout.toDevicePixels(length);
        }

        if (isNaN(converted)) {
            return 0;
        }
        return converted;
    }

    abstract _addChildFromBuilder(name: string, value: any): void;

    abstract _onItemsChanged(oldValue: any, newValue: any): void;
}


export class PagerItem extends GridLayout {
    constructor() {
        super();
    }

    onLoaded(): void {
        super.onLoaded();
    }
}

function onItemsChanged(pager: PagerBase, oldValue, newValue) {
    if (oldValue instanceof Observable) {
        removeWeakEventListener(
            oldValue,
            ObservableArray.changeEvent,
            pager.refresh,
            pager
        );
    }

    if (newValue instanceof Observable && !(newValue instanceof ObservableArray)) {
        addWeakEventListener(
            newValue,
            ObservableArray.changeEvent,
            pager.refresh,
            pager
        );
    }

    if (!(newValue instanceof Observable) || !(newValue instanceof ObservableArray)) {
        pager.refresh();
    }
    pager._onItemsChanged(oldValue, newValue);
}

function onItemTemplateChanged(pager: PagerBase, oldValue, newValue) {
    pager.itemTemplateUpdated(oldValue, newValue);
}

export const indicatorProperty = new Property<PagerBase, Indicator>({
    name: 'indicator',
    defaultValue: Indicator.None
});

indicatorProperty.register(PagerBase);

export const selectedIndexProperty = new CoercibleProperty<PagerBase, number>({
    name: 'selectedIndex',
    defaultValue: -1,
    affectsLayout: isIOS,
    coerceValue: (target, value) => {
        let items = target._childrenCount;
        if (items) {
            let max = items - 1;
            if (value < 0) {
                value = 0;
            }
            if (value > max) {
                value = max;
            }
        } else {
            value = -1;
        }

        return value;
    },
    valueConverter: v => parseInt(v, 10)
});
selectedIndexProperty.register(PagerBase);


export const spacingProperty = new Property<PagerBase, Length>({
    name: 'spacing',
    defaultValue: {value: 0, unit: 'dip'},
    affectsLayout: true
});

spacingProperty.register(PagerBase);

export const peakingProperty = new Property<PagerBase, Length>({
    name: 'peaking',
    defaultValue: {value: 0, unit: 'dip'},
    affectsLayout: true
});

peakingProperty.register(PagerBase);

export const itemsProperty = new Property<PagerBase, any>({
    name: 'items',
    affectsLayout: true,
    valueChanged: onItemsChanged
});
itemsProperty.register(PagerBase);


const booleanConverter = (v: any): boolean => {
    return String(v) === 'true';
};

export const itemTemplateProperty = new Property<PagerBase, string | Template>({
    name: 'itemTemplate',
    affectsLayout: true,
    valueChanged: target => {
        target.refresh();
    }
});
itemTemplateProperty.register(PagerBase);

export const itemTemplatesProperty = new Property<PagerBase,
    string | Array<KeyedTemplate>>({
    name: 'itemTemplates',
    affectsLayout: true,
    valueConverter: value => {
        if (typeof value === 'string') {
            return Builder.parseMultipleTemplates(value);
        }
        return value;
    }
});
itemTemplatesProperty.register(PagerBase);

export const canGoRightProperty = new Property<PagerBase, boolean>({
    name: 'canGoRight',
    defaultValue: false,
    valueConverter: booleanConverter
});
canGoRightProperty.register(PagerBase);

export const canGoLeftProperty = new Property<PagerBase, boolean>({
    name: 'canGoLeft',
    defaultValue: false,
    valueConverter: booleanConverter
});
canGoLeftProperty.register(PagerBase);

const converter = makeParser<Orientation>(
    makeValidator('horizontal', 'vertical')
);

export const orientationProperty = new Property<PagerBase, Orientation>({
    name: 'orientation',
    defaultValue: 'horizontal',
    affectsLayout: true,
    valueChanged: (
        target: PagerBase,
        oldValue: Orientation,
        newValue: Orientation
    ) => {
        target.refresh();
    },
    valueConverter: converter
});
orientationProperty.register(PagerBase);

export const disableSwipeProperty = new Property<PagerBase, boolean>({
    name: 'disableSwipe',
    defaultValue: false,
    valueConverter: booleanConverter
});

disableSwipeProperty.register(PagerBase);


export const perPageProperty = new Property<PagerBase, number>({
    name: 'perPage',
    defaultValue: 1
});

perPageProperty.register(PagerBase);


export const transformersProperty = new Property<PagerBase, string>({
    name: 'transformers'
});

transformersProperty.register(PagerBase);


export const showIndicatorProperty = new Property<PagerBase, boolean>({
    name: 'showIndicator',
    defaultValue: false
});
showIndicatorProperty.register(PagerBase);
