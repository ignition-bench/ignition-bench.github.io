"use strict";

const SVGNS = "http://www.w3.org/2000/svg";

let elements = [];
let memos = [];
let setName = "";
let timeOfDay = "";
const LIGHT_TYPES = ["lamp", "tv", "streetlamp"];
let idCounter = 1;
let ceilingOn = false;
function uid(){ return "e"+(idCounter++); }

const SIZES = { chair:[24,24], table:[50,50], bed:[90,60], desk:[70,35], tv:[50,10], shelf:[60,18], sofa:[80,38], person:[8,8],
  lamp:[14,14], book:[10,14], plant:[16,16], lowcab:[64,18],
  tree:[160,160], pine:[120,120], rock:[60,48], bush:[48,48], streetlamp:[16,16], bench:[64,20], fence:[120,6], car:[180,72], house:[320,240],
  mountain:[1600,1600], hill:[800,600], bridge:[480,120] };
const COLORS = { chair:"#c9c9d2", table:"#e8c98a", bed:"#7fb2ff", desk:"#e0a86f", tv:"#333333", shelf:"#c2a878", sofa:"#8f7fc9", person:"#ff5b7f",
  lamp:"#f2d27a", book:"#c0504d", plant:"#5fa865", lowcab:"#a98b6b",
  tree:"#5fa865", pine:"#3f8a5a", rock:"#9a9a9a", bush:"#6cbf5a", streetlamp:"#c9c9d2", bench:"#b08a5a", fence:"#c2a878", car:"#d9534f", house:"#d9b38c", mountain:"#56604a", hill:"#4a7330", bridge:"#a98b6b" };
const HEIGHTS3D = { chair:0.9, table:0.4, bed:0.5, desk:0.75, tv:0.65, shelf:1.8, sofa:0.75, person:1.7,
  lamp:0.5, book:0.05, plant:0.55, lowcab:0.5,
  tree:6, pine:8, rock:1.0, bush:1.0, streetlamp:4.5, bench:0.85, fence:1.2, car:1.5, house:6, mountain:25, hill:5, bridge:1.4 };
const SURFACE_TOP = { table:0.4, desk:0.75, lowcab:0.5, bed:0.5, shelf:1.8 };
const ROTATABLE_TYPES = ["chair","table","bed","desk","tv","shelf","sofa","lamp","book","plant","lowcab","rock","bench","fence","car","house","mountain","hill","bridge","zone"];
const MOUND_TYPES = ["mountain", "hill"];
const elHeight = el => el.hgt || HEIGHTS3D[el.type] || 0.6;
const DOOR_WIDTH_2D = 34;
const DOOR2_W_M = 1.6;
const isDoor2 = el => !!el && el.type === "door" && el.w > 1;
const doorW2D = el => isDoor2(el) ? Math.round(DOOR2_W_M * 40) : DOOR_WIDTH_2D;
function doorName(el){ return isDoor2(el) ? t("door2Name") : curLabels().door; }

const CELL = 20;
let snapM = 0.5;
const SNAPU = () => snapM * 40;
const planK = () => Math.max(1, snapM * 0.8, Math.max(boardCols, boardRows) * CELL / 900);
let floorType = "";
let boardCols = 20, boardRows = 15;
function boardW(){ return boardCols*CELL; }
function boardH(){ return boardRows*CELL; }

const SCALE3D = 1/40;
const WALL_H = 2.6;

let inLiveMode = false;

const SET_FILE_NAME = "directors-desk-set.json";
const SHOT_FILE_NAME = "directors-desk-view.png";
function setToJson(){
  return JSON.stringify({about: FILE_ABOUT.set, version:4, name: setName, time: timeOfDay || undefined, floor: floorType || undefined, snap: snapM !== 0.5 ? snapM : undefined, ceilingOn, boardCols, boardRows, elements, memos}, null, 2);
}
