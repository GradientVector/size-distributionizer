import { Component, ViewChild, ElementRef, OnInit } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { saveAs } from 'file-saver';
import { GoogleChartComponent } from 'ng2-google-charts';

enum ToolMode {
    Pan = 0,
    "Zoom In" = 1,
    "Zoom Out" = 2,
    Draw = 3,
}

/// https://stackoverflow.com/questions/21293063/how-to-programmatically-enumerate-an-enum-type-in-typescript-0-9-5
class EnumEx {
    static getNamesAndValues<T extends number>(e: any) {
        return EnumEx.getNames(e).map(n => ({ name: n, value: e[n] as T }));
    }

    static getNames(e: any) {
        return EnumEx.getObjValues(e).filter(v => typeof v === "string") as string[];
    }

    static getValues<T extends number>(e: any) {
        return EnumEx.getObjValues(e).filter(v => typeof v === "number") as T[];
    }

    private static getObjValues(e: any): (number | string)[] {
        return Object.keys(e).map(k => e[k]);
    }
}

interface MyFile {
    file: File,
    data: any,
}

@Component({
    selector: 'home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {

    constructor(private sanitizer: DomSanitizer) {

    }

    ngOnInit() {
        window.addEventListener('mouseup', (event) => this.onMouseUp(event), false);
        window.addEventListener('resize', (event) => this.onResize(event), false);
        this.setSvgHeight();
        //this.addMeasurement(100, 200, 300, 400);
        //this.setupHistogram();
    }

    onResize(event: Event) {
        this.setSvgHeight();
    }

    setSvgHeight() {
        let svgHeight = Math.max(100, (window.innerHeight - 200)).toString();
        (<SVGElement>this.svg.nativeElement).setAttribute('height', svgHeight);
        this.svgHeight = Number.parseInt(svgHeight);
        this.svgWidth = (<SVGElement>this.svg.nativeElement).clientWidth;
    }

    _toolMode: ToolMode = ToolMode.Draw;
    get toolMode(): ToolMode {
        return this._toolMode;
    }
    set toolMode(value: ToolMode) {
        this._toolMode = Number.parseInt(<any>value);
    }

    toolModes = EnumEx.getNamesAndValues(ToolMode);
    get svgCursorStyle() {
        let style = '';
        switch (this.toolMode)
        {
            case ToolMode.Pan:
                style = 'move';
                break;
            case ToolMode["Zoom In"]:
                style = 'zoom-in';
                break;
            case ToolMode["Zoom Out"]:
                style = 'zoom-out';
                break;
            case ToolMode.Draw:
                style = 'crosshair';
                break;
            default:
                console.log("Unhandled tool mode on click event.");
                break;
        }
        return style;
    }

    @ViewChild('hiddenCanvas')
    hiddenCanvas: ElementRef;

    @ViewChild('svg')
    svg: ElementRef;

    svgWidth: number = 500;
    svgHeight: number = 500;
    get svgAspectRatio(): number {
        return this.svgWidth / this.svgHeight;
    }
    get isAlignedToWidth(): boolean {
        return (this.svgAspectRatio < this.imageAspectRatio);
    }
    get correctedSvgWidth(): number {
        return this.isAlignedToWidth ? this.svgWidth : (this.imageAspectRatio * this.svgHeight);
    }
    get correctedSvgHeight(): number {
        return this.isAlignedToWidth ? (this.svgWidth / this.imageAspectRatio) : this.svgHeight;
    }
    get lineSizeCorrectionFactor(): number {
        return this.isAlignedToWidth ? (this.imageWidth / this.correctedSvgWidth) : (this.imageHeight / this.correctedSvgHeight);
    }
    get lineSize(): number {
        return 3 * this.lineSizeCorrectionFactor * this.zoomFactor;
    }
    get endpointRadius(): number {
        return 3 * this.lineSizeCorrectionFactor * this.zoomFactor;
    }
    get fontSize(): number {
        return 8 * this.lineSize;
    }
    resetPan() {
        this.viewBoxVector = new CanvasVector(0, 0);
        this.mouseDownStartVector = new CanvasVector(0, 0);
        this.mouseDownStartViewBoxVector = new CanvasVector(0, 0);
    }
    zoom = 0;
    resetZoom() {
        this.zoom = 0;
    }
    zoomIn() {
        this.zoom--;
    }
    zoomOut() {
        this.zoom++;
    }
    get zoomFactor() { return Math.pow(2, this.zoom); }
    get zoomPercent() { return Math.pow(2, -this.zoom) * 100;}
    viewBoxVector: CanvasVector = new CanvasVector(0, 0);
    get viewBoxWidth() {
        return this.imageWidth * this.zoomFactor;
    }
    get viewBoxHeight() {
        return this.imageHeight * this.zoomFactor;
    }
    get viewBox() {
        let x = this.viewBoxVector.x;
        let y = this.viewBoxVector.y;
        let w = this.viewBoxWidth;
        let h = this.viewBoxHeight
        let str = `${x} ${y} ${w} ${h}`;
        return str;
    }

    imageWidth = 500;
    imageHeight = 500;
    get imageAspectRatio(): number {
        return this.imageWidth / this.imageHeight;
    }

    _screenVector: ScreenVector = new ScreenVector(0, 0);
    get screenVector(): ScreenVector {
        return this._screenVector;
    }
    set screenVector(value: ScreenVector) {
        this._screenVector = value;
        this._canvasVector = this.toCanvas(value);
    }
    _canvasVector: CanvasVector = new CanvasVector(0, 0);
    get canvasVector(): CanvasVector {
        return this._canvasVector;
    }
    set canvasVector(value: CanvasVector) {
        this._canvasVector = value;
        this._screenVector = this.toScreen(value);
    }

    file: MyFile;
    files: MyFile[] = [];

    onClick(event: any) {
        switch (this.toolMode)
        {
            case ToolMode["Zoom In"]:
                this.zoomIn();
                break;
            case ToolMode["Zoom Out"]:
                this.zoomOut();
                break;
            default:
                break;
        }
    }

    isPanning = false;
    isDrawing = false;
    mouseDownStartVector: CanvasVector = new CanvasVector(0, 0);
    mouseDownStartViewBoxVector: CanvasVector = new CanvasVector(0, 0);

    currentMeasurement: Measurement;
    selectedEndpoint: number = 0;

    onMouseDown(event: MouseEvent) {
        let rec = (<SVGElement>this.svg.nativeElement).getBoundingClientRect();
        this.mouseDownStartViewBoxVector = new CanvasVector(this.viewBoxVector.x, this.viewBoxVector.y);
        this.screenVector = new ScreenVector(event.x - rec.left, event.y - rec.top);
        this.mouseDownStartVector = new CanvasVector(this.canvasVector.x, this.canvasVector.y);
        // If Pan-mode or not clicking with left mouse button.
        if ((this.toolMode == ToolMode.Pan) || event.button || event.ctrlKey) {
            this.isPanning = true;
        } else if (this.toolMode == ToolMode.Draw) {
            this.isDrawing = true;
            if (!this.selectedEndpoint) {
                this.currentMeasurement = this.addMeasurement(this.canvasVector.x, this.canvasVector.y);
            }
        }
        event.preventDefault();
    }

    onMouseUp(event: MouseEvent) {

        this.mouseDownStartViewBoxVector = new CanvasVector(this.canvasVector.x, this.canvasVector.y);
        if (this.isPanning) {

        } else if (this.isDrawing) {

        }

        this.isPanning = false;
        this.isDrawing = false;
        this.selectedEndpoint = 0;

        this.redrawDistribution();
    }

    onChange(event: EventTarget) {
        let eventObj: MSInputMethodContext = <MSInputMethodContext>event;
        let target: HTMLInputElement = <HTMLInputElement>eventObj.target;
        if (target) {
            this.files = [];
            for (let i = 0; i < target.files!.length || 0; i++) {
                let file = target.files![i];
                let fr = new FileReader();
                this.files[i] = {
                    file: file,
                    data: null,
                }
                fr.readAsDataURL(file);
                fr.onload = (evt: Event) => {
                    this.files[i].data = (<any>evt.target).result;
                    let img = new Image();
                    img.onload = () => {
                        this.viewBoxVector = new CanvasVector(0, 0);
                        this.mouseDownStartViewBoxVector = new CanvasVector(0, 0);
                        this.imageWidth = img.width;
                        this.imageHeight = img.height;
                    }
                    img.src = this.file.data;
                }
            };
            this.file = this.files[0];
        } else {
            console.log("No Target provided!");
        }
        this.resetZoom();
    }

    onSvgMouseMove(event: MouseEvent) {
        let rec = (<SVGElement>this.svg.nativeElement).getBoundingClientRect();
        this.screenVector = new ScreenVector(event.x - rec.left, event.y - rec.top);
        let deltaX = this.canvasVector.x - this.mouseDownStartVector.x;
        let deltaY = this.canvasVector.y - this.mouseDownStartVector.y;
        if (this.isDrawing || this.selectedEndpoint) {
            if (this.selectedEndpoint == 1) {
                this.currentMeasurement.v1.x = this.canvasVector.x;
                this.currentMeasurement.v1.y = this.canvasVector.y;
            } else {
                this.currentMeasurement.v2.x = this.canvasVector.x;
                this.currentMeasurement.v2.y = this.canvasVector.y;
            }
        } else if (this.isPanning) {
            let x = this.mouseDownStartViewBoxVector.x - (deltaX);
            let y = this.mouseDownStartViewBoxVector.y - (deltaY);
            this.viewBoxVector = new CanvasVector(x, y);
        }
    }

    onSvgMouseWheel(event: WheelEvent) {
        // cross-browser wheel delta
        event = <WheelEvent>window.event || event; // old IE support
        var delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)));
        if (event.shiftKey) { // Pan Vertical.
            this.viewBoxVector.y += (delta * 10);
        } else if (event.ctrlKey) { // Pan Horizontal.
            this.viewBoxVector.x += (delta * 10);
        } else { // Zoom
            let prevWidth = this.viewBoxWidth;
            let prevHeight = this.viewBoxHeight;
            this.zoom -= delta;
            let newWidth = this.viewBoxWidth;
            let newHeight = this.viewBoxHeight;
            // Determine how much to shift x,y
            let shiftX = (this.screenVector.x / this.correctedSvgWidth) * (newWidth - prevWidth);
            let shiftY = (this.screenVector.y / this.correctedSvgHeight) * (newHeight - prevHeight);
            this.viewBoxVector.x -= shiftX;
            this.viewBoxVector.y -= shiftY;
        }
        event.preventDefault();
    }

    toScreen(v: CanvasVector): ScreenVector {
        let x = ((v.x - this.mouseDownStartViewBoxVector.x) / this.viewBoxWidth) * this.correctedSvgWidth;
        let y = ((v.y - this.mouseDownStartViewBoxVector.y) / this.viewBoxHeight) * this.correctedSvgHeight;
        return new ScreenVector(Number.parseInt(x.toFixed(0)), Number.parseInt(y.toFixed(0)));
    }

    toCanvas(v: ScreenVector): CanvasVector {
        let x = ((v.x / this.correctedSvgWidth) * this.viewBoxWidth) + this.mouseDownStartViewBoxVector.x;
        let y = ((v.y / this.correctedSvgHeight) * this.viewBoxHeight) + this.mouseDownStartViewBoxVector.y;
        return new CanvasVector(Number.parseInt(x.toFixed(0)), Number.parseInt(y.toFixed(0)));
    }

    scale: Measurement = new Measurement(new CanvasVector(100, 100), new CanvasVector(200, 100), undefined, "#0000ff", (measurement) => this.redrawDistribution());

    measurements: Measurement[] = [];
    addMeasurement(x1: number, y1: number, x2?: number, y2?: number) {
        let v1 = new Vector(x1, y1);
        let v2 = new Vector(x2 || x1, y2 || y1);
        let measurement = new Measurement(v1, v2, this.scale);
        this.measurements.push(measurement);
        return measurement;
    }

    deleteMeasurement(measurement: Measurement) {
        let i = this.measurements.indexOf(measurement);
        this.measurements.splice(i, 1);
        this.redrawDistribution();
    }

    onMouseEnter(measurement: Measurement) {
        measurement.isSelected = true;
    }
    onMouseLeave(measurement: Measurement) {
        measurement.isSelected = false;
    }

    onMouseDownEndpoint1(event: MouseEvent, measurement: Measurement) {
        //event.stopPropagation();
        this.currentMeasurement = measurement;
        this.selectedEndpoint = 1;
    }
    onMouseDownEndpoint2(event: MouseEvent, measurement: Measurement) {
        //event.stopPropagation();
        this.currentMeasurement = measurement;
        this.selectedEndpoint = 2;
    }

    getFilename(suffix: string) {
        let now = new Date();
        let filename = `${now.getFullYear()}${now.getMonth()}${now.getDate()}_${now.getHours()}${now.getMinutes()}${now.getSeconds()}_Size_Distributionizer_Measurements.${suffix}`;
        return filename;
    }

    downloadCsvFile() {
        let data = 'length,units,pixels\n' +
            this.measurements.map((value, index, array) => {
                return `${value.lengthInUnits},${value.units},${value.lengthInPixels}`;
            }).join('\n');
        let blob = new Blob([data], { type: 'text/csv' });
        saveAs(blob, this.getFilename('csv'));
    }

    downloadImageFile() {
        var DOMURL = window.URL; // || window.webkitURL || window;
        let canvas = (<HTMLCanvasElement>this.hiddenCanvas.nativeElement);
        let ctx = canvas.getContext('2d');
        let svg = (<SVGElement>this.svg.nativeElement);
        let svgText = svg.outerHTML;
        let blob = new Blob([svgText], { type: 'image/svg+xml' });
        var url = DOMURL.createObjectURL(blob);
        let img = new Image(this.svgWidth, this.svgHeight);
        img.onload = () => {
            ctx!.drawImage(img, 0, 0, this.svgWidth, this.svgHeight, 0, 0, this.svgWidth, this.svgHeight);
            DOMURL.revokeObjectURL(url);
            let dataUrl = canvas.toBlob((b) => {
                if (b) {
                    saveAs(b, this.getFilename('png'));
                }
            });
        };
        img.src = url;
    }

    downloadSvgFile() {
        let canvas = (<HTMLCanvasElement>this.hiddenCanvas.nativeElement);
        let svg = (<SVGElement>this.svg.nativeElement);
        let data = svg.outerHTML;
        let blob = new Blob([data], { type: 'image/svg+xml' });
        saveAs(blob, this.getFilename('svg'));
    }

    @ViewChild('cchart') cchart: GoogleChartComponent;
    pieChartData = {
        chartType: 'Histogram',
        dataTable: [['Measurement', 'Length']],
        options: { title: 'Size Distribution', legend: { position: 'none' } },
    };

    setPieChartData() {
        this.pieChartData = {
            chartType: 'Histogram',
            dataTable: [['Measurement', 'Length']].concat(this.measurements.map(m => [`${m.lengthInUnits} ${m.units}`, m.lengthInUnits!.toString()])),
            options: { title: 'Size Distribution', legend: { position: 'none' } },
        };
    }

    redrawDistribution() {
        this.setPieChartData();
        let googleChartWrapper = this.cchart.wrapper;
        //force a redraw
        this.cchart.redraw();
    }
}

class Vector {
    constructor (
        public x: number,
        public y: number
    ) {

    }
}

class ScreenVector extends Vector {

}

class CanvasVector extends Vector {

}

class Measurement {
    constructor(
        public v1: Vector,
        public v2: Vector,
        protected scale?: Measurement,
        public color: string = '#ff0000',
        protected changeCallback: (measurement: Measurement) => void = () => {}
    ) {

    }

    get lengthInPixels(): number {
        let val = Number.parseFloat(Math.sqrt(Math.pow(this.v1.x - this.v2.x, 2) + Math.pow(this.v1.y - this.v2.y, 2)).toFixed(2));
        return val;
    }

    get lengthInUnits(): number | undefined {
        let val = (this.scale && this.scale.lengthInUnits)
            ? (this.lengthInPixels / this.scale.lengthInPixels) * this.scale.lengthInUnits
            : this._lengthInUnits;
        return (val) ? Number.parseFloat(val.toFixed(2)) : val;
    }
    set lengthInUnits(value) {
        this._lengthInUnits = value;
        this.changeCallback(this);
    }
    _lengthInUnits?: number = 100;

    get isScale(): boolean {
        return !this.scale;
    }

    _units: string = 'nm';
    get units(): string {
        return (this.scale) ? this.scale.units : this._units;
    }
    set units(value) {
        this._units = value;
        this.changeCallback(this);
    }

    isSelected: boolean;

    get textVector(): Vector {
        return (this.v1.x > this.v2.x) ? this.v1 : this.v2;
    }
}
